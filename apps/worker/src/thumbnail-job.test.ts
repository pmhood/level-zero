import { type JobDelivery } from '@level-zero/database';
import {
  ASSET_THUMBNAIL_JOB_STEPS,
  AssetService,
  JobService,
  PREVIEW_MAX_DIMENSION,
  THUMBNAIL_MAX_DIMENSION,
  createProject,
  systemClock,
  uuidIdGenerator,
  type Job,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryAssetRepository,
  InMemoryJobEvents,
  InMemoryJobQueue,
  InMemoryJobRepository,
  InMemoryObjectStorageProvider,
  InMemoryProjectRepository,
} from '@level-zero/domain/testing';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';

import { createThumbnailJobHandler } from './thumbnail-job';

const silentLogger = { log: () => {}, error: () => {} };

let jobs: JobService;
let assets: AssetService;
let project: Project;

beforeEach(async () => {
  const deps = { clock: systemClock, ids: uuidIdGenerator };
  const projectRepo = new InMemoryProjectRepository();

  jobs = new JobService(
    new InMemoryJobRepository(),
    projectRepo,
    new InMemoryJobQueue(),
    new InMemoryJobEvents(),
    deps,
  );
  assets = new AssetService(
    new InMemoryAssetRepository(),
    projectRepo,
    new InMemoryObjectStorageProvider(),
    deps,
  );

  project = await projectRepo.insert(
    createProject({ name: 'Deep Fathom' }, { clock: systemClock, ids: uuidIdGenerator }),
  );
});

function delivery(job: Job, overrides: Partial<JobDelivery> = {}): JobDelivery {
  return {
    jobId: job.id,
    projectId: job.projectId,
    kind: 'thumbnail',
    attempt: 1,
    willRetry: false,
    ...overrides,
  };
}

async function pngBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 100, g: 150, b: 220, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

async function queueThumbnailJob(sourceAssetId: string): Promise<Job> {
  return jobs.enqueue(project.id, {
    kind: 'thumbnail',
    targetId: sourceAssetId,
    totalSteps: ASSET_THUMBNAIL_JOB_STEPS.length,
  });
}

describe('running a thumbnail job', () => {
  it('generates only a thumbnail for a source no bigger than the thumbnail bound', async () => {
    const source = await assets.upload(project.id, {
      kind: 'image',
      filename: 'icon.png',
      mimeType: 'image/png',
      content: await pngBuffer(200, 150),
    });
    const job = await queueThumbnailJob(source.id);

    await createThumbnailJobHandler({ jobs, assets, logger: silentLogger })(delivery(job));

    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({
      status: 'complete',
      progress: { completed: ASSET_THUMBNAIL_JOB_STEPS.length, step: null },
    });

    const { items } = await assets.listByProject(project.id, {
      sourceAssetId: source.id,
      variants: ['thumbnail', 'preview'],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      variant: 'thumbnail',
      sourceAssetId: source.id,
      mimeType: 'image/webp',
      kind: 'image',
    });
    expect(items[0]!.width).toBeLessThanOrEqual(THUMBNAIL_MAX_DIMENSION);
  });

  it('also generates a preview for a source larger than the thumbnail bound', async () => {
    const source = await assets.upload(project.id, {
      kind: 'image',
      filename: 'portrait.png',
      mimeType: 'image/png',
      content: await pngBuffer(2000, 1000),
    });
    const job = await queueThumbnailJob(source.id);

    await createThumbnailJobHandler({ jobs, assets, logger: silentLogger })(delivery(job));

    const { items } = await assets.listByProject(project.id, {
      sourceAssetId: source.id,
      variants: ['thumbnail', 'preview'],
    });
    const thumbnail = items.find((item) => item.variant === 'thumbnail');
    const preview = items.find((item) => item.variant === 'preview');

    expect(thumbnail?.width).toBeLessThanOrEqual(THUMBNAIL_MAX_DIMENSION);
    expect(preview?.width).toBeLessThanOrEqual(PREVIEW_MAX_DIMENSION);
    expect(preview?.width).toBeGreaterThan(THUMBNAIL_MAX_DIMENSION);
  });

  it('never enlarges past the source, so a preview never upscales a small image', async () => {
    const source = await assets.upload(project.id, {
      kind: 'image',
      filename: 'tiny.png',
      mimeType: 'image/png',
      content: await pngBuffer(50, 50),
    });
    const job = await queueThumbnailJob(source.id);

    await createThumbnailJobHandler({ jobs, assets, logger: silentLogger })(delivery(job));

    const { items } = await assets.listByProject(project.id, {
      sourceAssetId: source.id,
      variants: ['thumbnail', 'preview'],
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.width).toBeLessThanOrEqual(50);
  });

  it('leaves the source asset usable, and does nothing for a job cancelled before pickup', async () => {
    const source = await assets.upload(project.id, {
      kind: 'image',
      filename: 'kael.png',
      mimeType: 'image/png',
      content: await pngBuffer(400, 400),
    });
    const job = await queueThumbnailJob(source.id);
    await jobs.cancel(project.id, job.id);

    await createThumbnailJobHandler({ jobs, assets, logger: silentLogger })(delivery(job));

    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({
      status: 'cancelled',
    });
    await expect(assets.getById(project.id, source.id)).resolves.toMatchObject({
      status: 'active',
    });
  });

  it('fails the job and leaves the source untouched when the bytes are not a real image', async () => {
    const source = await assets.upload(project.id, {
      kind: 'image',
      filename: 'corrupt.png',
      mimeType: 'image/png',
      content: Buffer.from('not actually an image'),
    });
    const job = await queueThumbnailJob(source.id);
    const handle = createThumbnailJobHandler({ jobs, assets, logger: silentLogger });

    await expect(handle(delivery(job))).rejects.toThrow();

    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({ status: 'failed' });
    // A failed thumbnail job is not an error on the source: it stays usable.
    await expect(assets.getById(project.id, source.id)).resolves.toMatchObject({
      id: source.id,
      status: 'active',
    });
    const { items } = await assets.listByProject(project.id, {
      sourceAssetId: source.id,
      variants: ['thumbnail'],
    });
    expect(items).toHaveLength(0);
  });

  it('records a retry rather than a failure while the queue will try again', async () => {
    const source = await assets.upload(project.id, {
      kind: 'image',
      filename: 'corrupt.png',
      mimeType: 'image/png',
      content: Buffer.from('not actually an image'),
    });
    const job = await queueThumbnailJob(source.id);
    const handle = createThumbnailJobHandler({ jobs, assets, logger: silentLogger });

    await expect(handle(delivery(job, { willRetry: true }))).rejects.toThrow();

    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({
      status: 'queued',
      attempt: 2,
    });
  });

  it('scopes a generated derivative to the same project as its source', async () => {
    const source = await assets.upload(project.id, {
      kind: 'image',
      filename: 'kael.png',
      mimeType: 'image/png',
      content: await pngBuffer(400, 400),
    });
    const job = await queueThumbnailJob(source.id);

    await createThumbnailJobHandler({ jobs, assets, logger: silentLogger })(delivery(job));

    const { items } = await assets.listByProject(project.id, {
      sourceAssetId: source.id,
      variants: ['thumbnail'],
    });
    expect(items[0]?.projectId).toBe(project.id);
  });
});
