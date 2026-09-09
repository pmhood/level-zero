import {
  AssetService,
  NotFoundError,
  ProjectService,
  systemClock,
  uuidIdGenerator,
  type Project,
} from '@level-zero/domain';
import { InMemoryObjectStorageProvider } from '@level-zero/domain/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DatabaseClient } from '../postgres/client';
import { connectTestDatabase, truncateDomainTables } from '../testing/test-database';
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
let assets: AssetService;
let storage: InMemoryObjectStorageProvider;

beforeAll(() => {
  client = connectTestDatabase();
  projectRepo = new DrizzleProjectRepository(client.db);
  assetRepo = new DrizzleAssetRepository(client.db);
  projects = new ProjectService(projectRepo, deps);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await truncateDomainTables(client);
  storage = new InMemoryObjectStorageProvider();
  assets = new AssetService(assetRepo, projectRepo, storage, deps);
});

async function seedProject(name: string): Promise<Project> {
  return projects.create({ name });
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
