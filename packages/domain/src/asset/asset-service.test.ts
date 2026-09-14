import { beforeEach, describe, expect, it } from 'vitest';

import { JobService } from '../job/job-service';
import { createProject } from '../project/project';
import { fixedClock } from '../shared/clock';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  InMemoryAssetRepository,
  InMemoryJobEvents,
  InMemoryJobQueue,
  InMemoryJobRepository,
  InMemoryObjectStorageProvider,
  InMemoryProjectRepository,
} from '../testing';
import { MAX_ASSET_UPLOAD_BYTES } from './asset';
import { type AssetRepository } from './asset-repository';
import { AssetService, type UploadAssetInput } from './asset-service';
import { type ObjectStorageProvider } from './object-storage';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let projects: InMemoryProjectRepository;
let assets: InMemoryAssetRepository;
let storage: InMemoryObjectStorageProvider;
let service: AssetService;
let projectId: string;

const uploadInput = (overrides: Partial<UploadAssetInput> = {}): UploadAssetInput => ({
  kind: 'image',
  filename: 'kael-portrait.png',
  mimeType: 'image/png',
  content: Buffer.from('pretend this is png bytes'),
  ...overrides,
});

beforeEach(async () => {
  projects = new InMemoryProjectRepository();
  assets = new InMemoryAssetRepository();
  storage = new InMemoryObjectStorageProvider();
  service = new AssetService(assets, projects, storage, {
    clock,
    ids: sequentialIdGenerator('asset'),
  });

  const project = await projects.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project') }),
  );
  projectId = project.id;
});

describe('upload', () => {
  it('stores the bytes and records metadata scoped to the project', async () => {
    const asset = await service.upload(projectId, uploadInput());

    expect(asset).toMatchObject({
      projectId,
      kind: 'image',
      filename: 'kael-portrait.png',
      mimeType: 'image/png',
      byteSize: Buffer.byteLength('pretend this is png bytes'),
      variant: 'source',
      status: 'active',
    });
    expect(asset.storageKey).toContain(projectId);
    expect(asset.checksum).toMatch(/^[0-9a-f]{64}$/);

    await expect(service.download(projectId, asset.id)).resolves.toMatchObject({
      content: Buffer.from('pretend this is png bytes'),
    });
  });

  it('computes a checksum that changes with the content', async () => {
    const a = await service.upload(projectId, uploadInput({ content: Buffer.from('a') }));
    const b = await service.upload(projectId, uploadInput({ content: Buffer.from('b') }));

    expect(a.checksum).not.toBe(b.checksum);
  });

  it('rejects an upload to a project that does not exist', async () => {
    await expect(service.upload('missing', uploadInput())).rejects.toThrow(NotFoundError);
  });

  it('rejects an upload to an archived project', async () => {
    const project = await projects.findById(projectId);
    await projects.save({ ...project!, status: 'archived' });

    await expect(service.upload(projectId, uploadInput())).rejects.toThrow(ConflictError);
  });

  it('rejects a file over the stated upload limit, without writing it to storage', async () => {
    const oversized = Buffer.alloc(MAX_ASSET_UPLOAD_BYTES + 1);

    await expect(service.upload(projectId, uploadInput({ content: oversized }))).rejects.toThrow(
      ValidationError,
    );
    expect(await assets.listByProject(projectId, {})).toMatchObject({ total: 0 });
  });

  it('accepts a file exactly at the stated upload limit', async () => {
    const atLimit = Buffer.alloc(MAX_ASSET_UPLOAD_BYTES);

    const asset = await service.upload(projectId, uploadInput({ content: atLimit }));

    expect(asset.byteSize).toBe(MAX_ASSET_UPLOAD_BYTES);
  });

  it('links a derivative to its source asset', async () => {
    const source = await service.upload(projectId, uploadInput());
    const thumbnail = await service.upload(
      projectId,
      uploadInput({
        filename: 'kael-portrait-thumb.png',
        variant: 'thumbnail',
        sourceAssetId: source.id,
      }),
    );

    expect(thumbnail).toMatchObject({ variant: 'thumbnail', sourceAssetId: source.id });
  });

  it('rejects a derivative whose declared source does not exist in the project', async () => {
    await expect(
      service.upload(
        projectId,
        uploadInput({ variant: 'thumbnail', sourceAssetId: 'missing-source' }),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects a derivative whose declared source belongs to a different project', async () => {
    const otherProject = await projects.insert(
      createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
    );
    const source = await service.upload(otherProject.id, uploadInput());

    await expect(
      service.upload(projectId, uploadInput({ variant: 'thumbnail', sourceAssetId: source.id })),
    ).rejects.toThrow(NotFoundError);
  });

  it('cleans up the uploaded object when the metadata insert fails', async () => {
    let putKey: string | undefined;
    const observedStorage: ObjectStorageProvider = {
      id: storage.id,
      put: (input) => {
        putKey = input.key;
        return storage.put(input);
      },
      get: (key) => storage.get(key),
      getUrl: (key, options) => storage.getUrl(key, options),
      delete: (key) => storage.delete(key),
    };
    const failingAssets: AssetRepository = {
      insert: async () => {
        throw new Error('insert failed');
      },
      findById: (id, assetId) => assets.findById(id, assetId),
      listByProject: (id, filter) => assets.listByProject(id, filter),
      save: (asset) => assets.save(asset),
    };
    const failingService = new AssetService(failingAssets, projects, observedStorage, {
      clock,
      ids: sequentialIdGenerator('asset'),
    });

    await expect(failingService.upload(projectId, uploadInput())).rejects.toThrow('insert failed');

    expect(putKey).toBeDefined();
    await expect(observedStorage.get(putKey!)).rejects.toThrow(NotFoundError);
  });
});

describe('thumbnails', () => {
  let queue: InMemoryJobQueue;
  let withJobs: AssetService;

  beforeEach(() => {
    queue = new InMemoryJobQueue();
    const jobs = new JobService(
      new InMemoryJobRepository(),
      projects,
      queue,
      new InMemoryJobEvents(),
      { clock, ids: sequentialIdGenerator('job') },
    );
    withJobs = new AssetService(
      assets,
      projects,
      storage,
      { clock, ids: sequentialIdGenerator('asset') },
      undefined,
      jobs,
    );
  });

  it('queues a thumbnail job for an uploaded image', async () => {
    const asset = await withJobs.upload(projectId, uploadInput());

    expect(queue.enqueued).toMatchObject([{ kind: 'thumbnail', targetId: asset.id, projectId }]);
  });

  it('does not queue a thumbnail for a non-image upload', async () => {
    await withJobs.upload(projectId, uploadInput({ kind: 'export', mimeType: 'application/pdf' }));

    expect(queue.enqueued).toHaveLength(0);
  });

  it('does not queue a thumbnail for a derivative, so a thumbnail never gets a thumbnail of its own', async () => {
    const source = await withJobs.upload(projectId, uploadInput());
    queue.enqueued.length = 0;

    await withJobs.upload(
      projectId,
      uploadInput({ variant: 'thumbnail', sourceAssetId: source.id }),
    );

    expect(queue.enqueued).toHaveLength(0);
  });

  it('does nothing when no job service is wired up', async () => {
    await expect(service.upload(projectId, uploadInput())).resolves.toBeTruthy();
  });
});

describe('backfilling thumbnails', () => {
  let queue: InMemoryJobQueue;
  let withJobs: AssetService;

  beforeEach(() => {
    queue = new InMemoryJobQueue();
    const jobs = new JobService(
      new InMemoryJobRepository(),
      projects,
      queue,
      new InMemoryJobEvents(),
      { clock, ids: sequentialIdGenerator('job') },
    );
    withJobs = new AssetService(
      assets,
      projects,
      storage,
      { clock, ids: sequentialIdGenerator('asset') },
      undefined,
      jobs,
    );
  });

  it('queues a thumbnail for every existing source image that has none yet', async () => {
    const withThumbnail = await withJobs.upload(projectId, uploadInput());
    await withJobs.upload(
      projectId,
      uploadInput({
        filename: 'existing-thumb.png',
        variant: 'thumbnail',
        sourceAssetId: withThumbnail.id,
      }),
    );
    const withoutThumbnail = await withJobs.upload(
      projectId,
      uploadInput({ filename: 'needs-a-thumbnail.png' }),
    );
    await withJobs.upload(projectId, uploadInput({ kind: 'export', mimeType: 'application/pdf' }));
    queue.enqueued.length = 0;

    const queued = await withJobs.backfillThumbnails(projectId);

    expect(queued).toBe(1);
    expect(queue.enqueued).toMatchObject([{ kind: 'thumbnail', targetId: withoutThumbnail.id }]);
  });

  it('is a no-op without a job service', async () => {
    await service.upload(projectId, uploadInput());

    await expect(service.backfillThumbnails(projectId)).resolves.toBe(0);
  });

  it('rejects a project that does not exist', async () => {
    await expect(withJobs.backfillThumbnails('missing')).rejects.toThrow(NotFoundError);
  });
});

describe('project scoping', () => {
  it('never reads an asset through the wrong project', async () => {
    const otherProject = await projects.insert(
      createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
    );
    const asset = await service.upload(projectId, uploadInput());

    await expect(service.getById(otherProject.id, asset.id)).rejects.toThrow(NotFoundError);
    await expect(service.getById(projectId, asset.id)).resolves.toMatchObject({ id: asset.id });
  });

  it('never lists another project assets', async () => {
    const otherProject = await projects.insert(
      createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
    );
    await service.upload(projectId, uploadInput());
    await service.upload(otherProject.id, uploadInput({ filename: 'other.png' }));

    const page = await service.listByProject(projectId);
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(1);
  });
});

describe('retrieval', () => {
  it('reports a missing asset as not found', async () => {
    await expect(service.getById(projectId, 'missing')).rejects.toThrow(NotFoundError);
  });

  it('resolves a safe url through the storage provider', async () => {
    const asset = await service.upload(projectId, uploadInput());

    await expect(service.getUrl(projectId, asset.id)).resolves.toContain(asset.storageKey);
  });

  it('downloads the exact bytes that were uploaded', async () => {
    const content = Buffer.from('exact bytes');
    const asset = await service.upload(projectId, uploadInput({ content }));

    const downloaded = await service.download(projectId, asset.id);
    expect(downloaded.content).toEqual(content);
    expect(downloaded.asset.id).toBe(asset.id);
  });
});

describe('archive and restore', () => {
  it('archives and restores an asset without deleting its bytes', async () => {
    const asset = await service.upload(projectId, uploadInput());

    const archived = await service.archive(projectId, asset.id);
    expect(archived.status).toBe('archived');
    await expect(service.download(projectId, asset.id)).resolves.toBeTruthy();

    const restored = await service.restore(projectId, asset.id);
    expect(restored.status).toBe('active');
  });

  it('hides archived assets from a default listing', async () => {
    const asset = await service.upload(projectId, uploadInput());
    await service.archive(projectId, asset.id);

    await expect(service.listByProject(projectId)).resolves.toMatchObject({ total: 0 });
    await expect(
      service.listByProject(projectId, { includeArchived: true }),
    ).resolves.toMatchObject({ total: 1 });
  });

  it('rejects archiving through the wrong project', async () => {
    const otherProject = await projects.insert(
      createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
    );
    const asset = await service.upload(projectId, uploadInput());

    await expect(service.archive(otherProject.id, asset.id)).rejects.toThrow(NotFoundError);
  });

  it('rejects archiving the same asset twice', async () => {
    const asset = await service.upload(projectId, uploadInput());
    await service.archive(projectId, asset.id);

    await expect(service.archive(projectId, asset.id)).rejects.toThrow(ValidationError);
  });
});
