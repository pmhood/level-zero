import {
  ActivityService,
  AssetService,
  NotFoundError,
  ProjectService,
  fixedClock,
  systemClock,
  uuidIdGenerator,
  type Project,
} from '@level-zero/domain';
import { InMemoryObjectStorageProvider } from '@level-zero/domain/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DatabaseClient } from '../postgres/client';
import { connectTestDatabase, truncateDomainTables } from '../testing/test-database';
import { DrizzleActivityRepository } from './activity-repository';
import { DrizzleAssetRepository } from './asset-repository';
import { DrizzleProjectRepository } from './project-repository';

/**
 * Drizzle wraps driver errors, so the Postgres SQLSTATE lives on the cause
 * chain rather than in the message.
 */
async function expectPostgresError(operation: Promise<unknown>, code: string): Promise<void> {
  let thrown: unknown;
  try {
    await operation;
  } catch (error) {
    thrown = error;
  }

  const codes: string[] = [];
  for (let error = thrown; error instanceof Error; error = error.cause) {
    const candidate = (error as Error & { code?: string }).code;
    if (candidate) codes.push(candidate);
  }

  expect(thrown, 'expected the statement to be rejected').toBeInstanceOf(Error);
  expect(codes).toContain(code);
}

const deps = { clock: systemClock, ids: uuidIdGenerator };

let client: DatabaseClient;
let projectRepo: DrizzleProjectRepository;
let assetRepo: DrizzleAssetRepository;
let projects: ProjectService;
let activity: ActivityService;
let assets: AssetService;
let storage: InMemoryObjectStorageProvider;

beforeAll(async () => {
  client = await connectTestDatabase();
  projectRepo = new DrizzleProjectRepository(client.db);
  assetRepo = new DrizzleAssetRepository(client.db);
  projects = new ProjectService(projectRepo, deps);
  activity = new ActivityService(new DrizzleActivityRepository(client.db), deps);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await truncateDomainTables(client);
  storage = new InMemoryObjectStorageProvider();
  assets = new AssetService(assetRepo, projectRepo, storage, activity, deps);
});

async function seedProject(name: string): Promise<Project> {
  return projects.create({ name });
}

/**
 * The same service writing at a stated instant, so tests can control
 * `createdAt`/`updatedAt` ordering precisely instead of relying on wall-clock
 * timing between uploads.
 */
function assetsAt(instant: string): AssetService {
  return new AssetService(assetRepo, projectRepo, storage, activity, {
    clock: fixedClock(instant),
    ids: uuidIdGenerator,
  });
}

describe('upload metadata', () => {
  it('round-trips an asset with its metadata, independent of any storage-provider url', async () => {
    const project = await seedProject('Deep Fathom');

    const created = await assets.upload(project.id, {
      kind: 'image',
      filename: 'kael-portrait.png',
      mimeType: 'image/png',
      content: Buffer.from('pretend png bytes'),
      width: 1024,
      height: 1024,
      createdBy: 'pete',
    });

    const found = await assets.getById(project.id, created.id);

    expect(found).toMatchObject({
      projectId: project.id,
      kind: 'image',
      filename: 'kael-portrait.png',
      mimeType: 'image/png',
      byteSize: Buffer.byteLength('pretend png bytes'),
      width: 1024,
      height: 1024,
      variant: 'source',
      sourceAssetId: null,
      status: 'active',
      createdBy: 'pete',
    });
    expect(found.checksum).toMatch(/^[0-9a-f]{64}$/);
    // The persisted key is a storage key, not a provider URL.
    expect(found.storageKey).not.toMatch(/^https?:\/\//);
    expect(found.createdAt).toBeInstanceOf(Date);
  });

  it('stores every asset kind in the one table', async () => {
    const project = await seedProject('Deep Fathom');
    const kinds = [
      'image',
      'video',
      'audio',
      'model_3d',
      'reference',
      'export',
      'build_artifact',
    ] as const;

    for (const kind of kinds) {
      await assets.upload(project.id, {
        kind,
        filename: `a.${kind}`,
        mimeType: 'application/octet-stream',
        content: Buffer.from(kind),
      });
    }

    const page = await assets.listByProject(project.id);
    expect(page.total).toBe(kinds.length);
  });

  it('links a derivative to its source asset and rejects an inconsistent variant', async () => {
    const project = await seedProject('Deep Fathom');
    const source = await assets.upload(project.id, {
      kind: 'image',
      filename: 'kael.png',
      mimeType: 'image/png',
      content: Buffer.from('source bytes'),
    });

    const thumbnail = await assets.upload(project.id, {
      kind: 'image',
      filename: 'kael-thumb.png',
      mimeType: 'image/png',
      content: Buffer.from('thumb bytes'),
      variant: 'thumbnail',
      sourceAssetId: source.id,
    });

    expect(thumbnail).toMatchObject({ variant: 'thumbnail', sourceAssetId: source.id });

    // The database itself enforces the invariant, not just the service.
    await expectPostgresError(
      client.db.execute(
        sql`insert into assets (id, project_id, kind, filename, mime_type, byte_size, storage_key, checksum, variant, source_asset_id)
            values (gen_random_uuid(), ${project.id}, 'image', 'bad.png', 'image/png', 1, 'k', 'c', 'thumbnail', null)`,
      ),
      '23514',
    );
  });
});

describe('project scoping', () => {
  it('never reads an asset through the wrong project', async () => {
    const [a, b] = [await seedProject('A'), await seedProject('B')];
    const asset = await assets.upload(a.id, {
      kind: 'image',
      filename: 'kael.png',
      mimeType: 'image/png',
      content: Buffer.from('x'),
    });

    await expect(assetRepo.findById(b.id, asset.id)).resolves.toBeNull();
    await expect(assetRepo.findById(a.id, asset.id)).resolves.toMatchObject({ id: asset.id });
  });

  it('never lists another project assets', async () => {
    const [a, b] = [await seedProject('A'), await seedProject('B')];
    await assets.upload(a.id, {
      kind: 'image',
      filename: 'a.png',
      mimeType: 'image/png',
      content: Buffer.from('a'),
    });
    await assets.upload(b.id, {
      kind: 'image',
      filename: 'b.png',
      mimeType: 'image/png',
      content: Buffer.from('b'),
    });

    const page = await assets.listByProject(a.id);
    expect(page.items.map((asset) => asset.filename)).toEqual(['a.png']);
  });

  it('never archives an asset through the wrong project', async () => {
    const [a, b] = [await seedProject('A'), await seedProject('B')];
    const asset = await assets.upload(a.id, {
      kind: 'image',
      filename: 'kael.png',
      mimeType: 'image/png',
      content: Buffer.from('x'),
    });

    await expect(assets.archive(b.id, asset.id)).rejects.toThrow(NotFoundError);
  });

  it('never creates a derivative naming a source from a different project (#176)', async () => {
    const [a, b] = [await seedProject('A'), await seedProject('B')];
    const source = await assets.upload(a.id, {
      kind: 'image',
      filename: 'kael.png',
      mimeType: 'image/png',
      content: Buffer.from('x'),
    });

    await expect(
      assets.upload(b.id, {
        kind: 'image',
        filename: 'kael-thumb.png',
        mimeType: 'image/webp',
        content: Buffer.from('thumb bytes'),
        variant: 'thumbnail',
        sourceAssetId: source.id,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('always scopes a derivative to the same project as its source (#176)', async () => {
    const project = await seedProject('Deep Fathom');
    const source = await assets.upload(project.id, {
      kind: 'image',
      filename: 'kael.png',
      mimeType: 'image/png',
      content: Buffer.from('source bytes'),
    });

    const thumbnail = await assets.upload(project.id, {
      kind: 'image',
      filename: 'kael-thumb.png',
      mimeType: 'image/webp',
      content: Buffer.from('thumb bytes'),
      variant: 'thumbnail',
      sourceAssetId: source.id,
    });

    expect(thumbnail.projectId).toBe(source.projectId);
    await expect(assetRepo.findById(project.id, thumbnail.id)).resolves.toMatchObject({
      projectId: project.id,
      sourceAssetId: source.id,
    });
  });
});

describe('retrieval', () => {
  it('downloads the exact bytes that were uploaded', async () => {
    const project = await seedProject('Deep Fathom');
    const content = Buffer.from('exact round-tripped bytes');
    const created = await assets.upload(project.id, {
      kind: 'image',
      filename: 'kael.png',
      mimeType: 'image/png',
      content,
    });

    const downloaded = await assets.download(project.id, created.id);
    expect(downloaded.content).toEqual(content);
  });

  it('resolves a url through the configured storage provider', async () => {
    const project = await seedProject('Deep Fathom');
    const created = await assets.upload(project.id, {
      kind: 'image',
      filename: 'kael.png',
      mimeType: 'image/png',
      content: Buffer.from('x'),
    });

    await expect(assets.getUrl(project.id, created.id)).resolves.toContain(created.storageKey);
  });
});

describe('deletion and archive behavior', () => {
  it('archives an asset, hiding it from a default listing but keeping it retrievable', async () => {
    const project = await seedProject('Deep Fathom');
    const created = await assets.upload(project.id, {
      kind: 'image',
      filename: 'kael.png',
      mimeType: 'image/png',
      content: Buffer.from('x'),
    });

    const archived = await assets.archive(project.id, created.id);
    expect(archived.status).toBe('archived');
    expect(archived.archivedAt).toBeInstanceOf(Date);

    await expect(assets.listByProject(project.id)).resolves.toMatchObject({ total: 0 });
    await expect(
      assets.listByProject(project.id, { includeArchived: true }),
    ).resolves.toMatchObject({ total: 1 });
    // Archiving does not delete bytes.
    await expect(assets.download(project.id, created.id)).resolves.toMatchObject({
      content: Buffer.from('x'),
    });
  });

  it('restores an archived asset', async () => {
    const project = await seedProject('Deep Fathom');
    const created = await assets.upload(project.id, {
      kind: 'image',
      filename: 'kael.png',
      mimeType: 'image/png',
      content: Buffer.from('x'),
    });
    await assets.archive(project.id, created.id);

    const restored = await assets.restore(project.id, created.id);
    expect(restored).toMatchObject({ status: 'active', archivedAt: null });
  });

  it('removes a project assets when the project row is deleted', async () => {
    const project = await seedProject('Deep Fathom');
    await assets.upload(project.id, {
      kind: 'image',
      filename: 'kael.png',
      mimeType: 'image/png',
      content: Buffer.from('x'),
    });

    // Deleting a project is not a product feature; this proves the cascade
    // exists so no orphan assets can be left behind.
    await client.db.execute(sql`delete from projects where id = ${project.id}`);

    await expect(assets.listByProject(project.id)).resolves.toMatchObject({ total: 0 });
  });
});

describe('mime-family filter', () => {
  it('narrows by the part of mimeType before the slash, in SQL, not after paging', async () => {
    const project = await seedProject('Deep Fathom');
    await assets.upload(project.id, {
      kind: 'image',
      filename: 'a.png',
      mimeType: 'image/png',
      content: Buffer.from('a'),
    });
    await assets.upload(project.id, {
      kind: 'video',
      filename: 'b.mp4',
      mimeType: 'video/mp4',
      content: Buffer.from('b'),
    });
    await assets.upload(project.id, {
      kind: 'export',
      filename: 'c.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('c'),
    });

    const images = await assets.listByProject(project.id, { mimeFamilies: ['image'] });
    expect(images.items.map((asset) => asset.filename)).toEqual(['a.png']);
    expect(images.total).toBe(1);

    const imagesAndVideos = await assets.listByProject(project.id, {
      mimeFamilies: ['image', 'video'],
    });
    expect(imagesAndVideos.items.map((asset) => asset.filename).sort()).toEqual(['a.png', 'b.mp4']);
    expect(imagesAndVideos.total).toBe(2);
  });

  it('never matches another project asset', async () => {
    const [a, b] = [await seedProject('A'), await seedProject('B')];
    await assets.upload(a.id, {
      kind: 'image',
      filename: 'a.png',
      mimeType: 'image/png',
      content: Buffer.from('a'),
    });
    await assets.upload(b.id, {
      kind: 'image',
      filename: 'b.png',
      mimeType: 'image/png',
      content: Buffer.from('b'),
    });

    const page = await assets.listByProject(a.id, { mimeFamilies: ['image'] });
    expect(page.items.map((asset) => asset.filename)).toEqual(['a.png']);
  });
});

describe('pipeline stage', () => {
  it('defaults every asset to concept, including ones that existed before the migration', async () => {
    const project = await seedProject('Deep Fathom');

    const asset = await assets.upload(project.id, {
      kind: 'image',
      filename: 'kael-portrait.png',
      mimeType: 'image/png',
      content: Buffer.from('pretend png bytes'),
    });

    expect(asset.pipelineStage).toBe('concept');
    const reread = await assets.getById(project.id, asset.id);
    expect(reread.pipelineStage).toBe('concept');
  });

  it('narrows by pipelineStages, in SQL, scoped to the project', async () => {
    const [a, b] = [await seedProject('A'), await seedProject('B')];

    const concept = await assets.upload(a.id, {
      kind: 'image',
      filename: 'concept.png',
      mimeType: 'image/png',
      content: Buffer.from('a'),
    });
    const inProgress = await assets.upload(a.id, {
      kind: 'image',
      filename: 'in-progress.png',
      mimeType: 'image/png',
      content: Buffer.from('b'),
    });
    await assets.setPipelineStage(a.id, inProgress.id, 'in_progress');
    const otherProjectAsset = await assets.upload(b.id, {
      kind: 'image',
      filename: 'other-project.png',
      mimeType: 'image/png',
      content: Buffer.from('c'),
    });
    await assets.setPipelineStage(b.id, otherProjectAsset.id, 'in_progress');

    const page = await assets.listByProject(a.id, { pipelineStages: ['in_progress'] });
    expect(page.items.map((asset) => asset.id)).toEqual([inProgress.id]);
    expect(page.total).toBe(1);

    const both = await assets.listByProject(a.id, {
      pipelineStages: ['concept', 'in_progress'],
    });
    expect(both.items.map((asset) => asset.id).sort()).toEqual([concept.id, inProgress.id].sort());
  });

  it('moves any stage to any other, writing the column', async () => {
    const project = await seedProject('Deep Fathom');
    const asset = await assets.upload(project.id, {
      kind: 'image',
      filename: 'kael-suit.png',
      mimeType: 'image/png',
      content: Buffer.from('a'),
    });

    await assets.setPipelineStage(project.id, asset.id, 'production_ready');
    const sentBack = await assets.setPipelineStage(project.id, asset.id, 'concept');

    expect(sentBack.pipelineStage).toBe('concept');
    const reread = await assets.getById(project.id, asset.id);
    expect(reread.pipelineStage).toBe('concept');
  });
});

describe('date-range filter', () => {
  it('narrows by createdAfter and createdBefore, half-open', async () => {
    const project = await seedProject('Deep Fathom');
    const day1 = await assetsAt('2026-01-01T00:00:00.000Z').upload(project.id, {
      kind: 'image',
      filename: 'day1.png',
      mimeType: 'image/png',
      content: Buffer.from('1'),
    });
    const day2 = await assetsAt('2026-01-02T00:00:00.000Z').upload(project.id, {
      kind: 'image',
      filename: 'day2.png',
      mimeType: 'image/png',
      content: Buffer.from('2'),
    });
    const day3 = await assetsAt('2026-01-03T00:00:00.000Z').upload(project.id, {
      kind: 'image',
      filename: 'day3.png',
      mimeType: 'image/png',
      content: Buffer.from('3'),
    });

    const after = await assets.listByProject(project.id, {
      createdAfter: new Date('2026-01-02T00:00:00.000Z'),
      sortBy: 'createdAt',
      sortDirection: 'asc',
    });
    expect(after.items.map((asset) => asset.id)).toEqual([day2.id, day3.id]);
    expect(after.total).toBe(2);

    // Exclusive: an asset created exactly at the boundary is not "before" it.
    const before = await assets.listByProject(project.id, {
      createdBefore: new Date('2026-01-02T00:00:00.000Z'),
    });
    expect(before.items.map((asset) => asset.id)).toEqual([day1.id]);
    expect(before.total).toBe(1);

    const between = await assets.listByProject(project.id, {
      createdAfter: new Date('2026-01-01T00:00:00.000Z'),
      createdBefore: new Date('2026-01-03T00:00:00.000Z'),
    });
    // Inclusive lower bound, exclusive upper bound: day1 and day2, not day3.
    expect(between.items.map((asset) => asset.id)).toEqual([day2.id, day1.id]);
  });

  it('never matches another project asset with createdAfter', async () => {
    const [a, b] = [await seedProject('A'), await seedProject('B')];
    await assetsAt('2026-01-01T00:00:00.000Z').upload(a.id, {
      kind: 'image',
      filename: 'a.png',
      mimeType: 'image/png',
      content: Buffer.from('a'),
    });
    await assetsAt('2026-01-01T00:00:00.000Z').upload(b.id, {
      kind: 'image',
      filename: 'b.png',
      mimeType: 'image/png',
      content: Buffer.from('b'),
    });

    const page = await assets.listByProject(a.id, {
      createdAfter: new Date('2020-01-01T00:00:00.000Z'),
    });
    expect(page.items.map((asset) => asset.filename)).toEqual(['a.png']);
  });

  it('never matches another project asset with createdBefore', async () => {
    const [a, b] = [await seedProject('A'), await seedProject('B')];
    await assetsAt('2026-01-01T00:00:00.000Z').upload(a.id, {
      kind: 'image',
      filename: 'a.png',
      mimeType: 'image/png',
      content: Buffer.from('a'),
    });
    await assetsAt('2026-01-01T00:00:00.000Z').upload(b.id, {
      kind: 'image',
      filename: 'b.png',
      mimeType: 'image/png',
      content: Buffer.from('b'),
    });

    const page = await assets.listByProject(a.id, {
      createdBefore: new Date('2030-01-01T00:00:00.000Z'),
    });
    expect(page.items.map((asset) => asset.filename)).toEqual(['a.png']);
  });
});

describe('sort order', () => {
  it('defaults to createdAt descending, tying on id, when no sort is given', async () => {
    const project = await seedProject('Deep Fathom');
    const first = await assetsAt('2026-01-01T00:00:00.000Z').upload(project.id, {
      kind: 'image',
      filename: 'first.png',
      mimeType: 'image/png',
      content: Buffer.from('1'),
    });
    const second = await assetsAt('2026-01-02T00:00:00.000Z').upload(project.id, {
      kind: 'image',
      filename: 'second.png',
      mimeType: 'image/png',
      content: Buffer.from('2'),
    });

    const page = await assets.listByProject(project.id);
    expect(page.items.map((asset) => asset.id)).toEqual([second.id, first.id]);
  });

  it('sorts by createdAt in both directions', async () => {
    const project = await seedProject('Deep Fathom');
    const first = await assetsAt('2026-01-01T00:00:00.000Z').upload(project.id, {
      kind: 'image',
      filename: 'first.png',
      mimeType: 'image/png',
      content: Buffer.from('1'),
    });
    const second = await assetsAt('2026-01-02T00:00:00.000Z').upload(project.id, {
      kind: 'image',
      filename: 'second.png',
      mimeType: 'image/png',
      content: Buffer.from('2'),
    });
    const third = await assetsAt('2026-01-03T00:00:00.000Z').upload(project.id, {
      kind: 'image',
      filename: 'third.png',
      mimeType: 'image/png',
      content: Buffer.from('3'),
    });

    const desc = await assets.listByProject(project.id, {
      sortBy: 'createdAt',
      sortDirection: 'desc',
    });
    expect(desc.items.map((asset) => asset.id)).toEqual([third.id, second.id, first.id]);

    const asc = await assets.listByProject(project.id, {
      sortBy: 'createdAt',
      sortDirection: 'asc',
    });
    expect(asc.items.map((asset) => asset.id)).toEqual([first.id, second.id, third.id]);
  });

  it('sorts by updatedAt in both directions, independent of createdAt order', async () => {
    const project = await seedProject('Deep Fathom');
    // Both created at the same instant, then restored in reverse order so
    // `updatedAt` disagrees with `createdAt` and the sort field actually matters.
    const a = await assetsAt('2026-01-01T00:00:00.000Z').upload(project.id, {
      kind: 'image',
      filename: 'a.png',
      mimeType: 'image/png',
      content: Buffer.from('a'),
    });
    const b = await assetsAt('2026-01-01T00:00:00.000Z').upload(project.id, {
      kind: 'image',
      filename: 'b.png',
      mimeType: 'image/png',
      content: Buffer.from('b'),
    });

    await assetsAt('2026-02-01T00:00:00.000Z').archive(project.id, a.id);
    await assetsAt('2026-02-02T00:00:00.000Z').restore(project.id, a.id);
    await assetsAt('2026-02-03T00:00:00.000Z').archive(project.id, b.id);
    await assetsAt('2026-02-04T00:00:00.000Z').restore(project.id, b.id);

    const asc = await assets.listByProject(project.id, {
      sortBy: 'updatedAt',
      sortDirection: 'asc',
    });
    expect(asc.items.map((asset) => asset.id)).toEqual([a.id, b.id]);

    const desc = await assets.listByProject(project.id, {
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    });
    expect(desc.items.map((asset) => asset.id)).toEqual([b.id, a.id]);
  });

  it('sorts by filename in both directions', async () => {
    const project = await seedProject('Deep Fathom');
    await assets.upload(project.id, {
      kind: 'image',
      filename: 'zebra.png',
      mimeType: 'image/png',
      content: Buffer.from('z'),
    });
    await assets.upload(project.id, {
      kind: 'image',
      filename: 'apple.png',
      mimeType: 'image/png',
      content: Buffer.from('a'),
    });
    await assets.upload(project.id, {
      kind: 'image',
      filename: 'mango.png',
      mimeType: 'image/png',
      content: Buffer.from('m'),
    });

    const asc = await assets.listByProject(project.id, {
      sortBy: 'filename',
      sortDirection: 'asc',
    });
    expect(asc.items.map((asset) => asset.filename)).toEqual([
      'apple.png',
      'mango.png',
      'zebra.png',
    ]);

    const desc = await assets.listByProject(project.id, {
      sortBy: 'filename',
      sortDirection: 'desc',
    });
    expect(desc.items.map((asset) => asset.filename)).toEqual([
      'zebra.png',
      'mango.png',
      'apple.png',
    ]);
  });

  it('sorts by byteSize in both directions', async () => {
    const project = await seedProject('Deep Fathom');
    await assets.upload(project.id, {
      kind: 'image',
      filename: 'small.png',
      mimeType: 'image/png',
      content: Buffer.from('x'),
    });
    await assets.upload(project.id, {
      kind: 'image',
      filename: 'large.png',
      mimeType: 'image/png',
      content: Buffer.from('x'.repeat(100)),
    });
    await assets.upload(project.id, {
      kind: 'image',
      filename: 'medium.png',
      mimeType: 'image/png',
      content: Buffer.from('x'.repeat(10)),
    });

    const asc = await assets.listByProject(project.id, {
      sortBy: 'byteSize',
      sortDirection: 'asc',
    });
    expect(asc.items.map((asset) => asset.filename)).toEqual([
      'small.png',
      'medium.png',
      'large.png',
    ]);

    const desc = await assets.listByProject(project.id, {
      sortBy: 'byteSize',
      sortDirection: 'desc',
    });
    expect(desc.items.map((asset) => asset.filename)).toEqual([
      'large.png',
      'medium.png',
      'small.png',
    ]);
  });
});

describe('paging with tied sort values', () => {
  it('returns every asset exactly once when several share a timestamp', async () => {
    const project = await seedProject('Deep Fathom');
    const sameInstant = assetsAt('2026-01-01T00:00:00.000Z');

    const uploaded = [];
    for (let i = 0; i < 5; i += 1) {
      uploaded.push(
        await sameInstant.upload(project.id, {
          kind: 'image',
          filename: `tied-${i}.png`,
          mimeType: 'image/png',
          content: Buffer.from(`tied-${i}`),
        }),
      );
    }

    const seen: string[] = [];
    for (let offset = 0; offset < uploaded.length; offset += 2) {
      const page = await assets.listByProject(project.id, { limit: 2, offset });
      seen.push(...page.items.map((asset) => asset.id));
    }

    expect(seen).toHaveLength(uploaded.length);
    expect(new Set(seen)).toEqual(new Set(uploaded.map((asset) => asset.id)));
  });
});
