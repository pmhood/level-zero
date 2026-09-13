import {
  AssetService,
  ProjectService,
  completeGeneration,
  createGeneration,
  dispatchGeneration,
  fixedClock,
  systemClock,
  uuidIdGenerator,
  type Generation,
  type Project,
} from '@level-zero/domain';
import { InMemoryObjectStorageProvider } from '@level-zero/domain/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DatabaseClient } from '../postgres/client';
import { countQueries } from '../testing/query-counter';
import { connectTestDatabase, truncateDomainTables } from '../testing/test-database';
import { DrizzleAssetLibraryReadModel } from './asset-library-read-model';
import { DrizzleAssetRepository } from './asset-repository';
import { DrizzleGenerationRepository } from './generation-repository';
import { DrizzleProjectRepository } from './project-repository';

const deps = { clock: systemClock, ids: uuidIdGenerator };

let client: DatabaseClient;
let projectRepo: DrizzleProjectRepository;
let assetRepo: DrizzleAssetRepository;
let generationRepo: DrizzleGenerationRepository;
let readModel: DrizzleAssetLibraryReadModel;
let projects: ProjectService;
let assets: AssetService;
let storage: InMemoryObjectStorageProvider;

beforeAll(async () => {
  client = await connectTestDatabase();
  projectRepo = new DrizzleProjectRepository(client.db);
  assetRepo = new DrizzleAssetRepository(client.db);
  generationRepo = new DrizzleGenerationRepository(client.db);
  readModel = new DrizzleAssetLibraryReadModel(client.db);
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

/**
 * Records a completed generation whose outputs are `outputAssetIds`, at
 * `createdAt`, so tests can control which generation is "the most recent"
 * without relying on wall-clock timing between inserts.
 */
async function recordGeneration(
  projectId: string,
  outputAssetIds: string[],
  createdAt: string,
  overrides: { provider?: string; model?: string } = {},
): Promise<Generation> {
  const genDeps = { clock: fixedClock(createdAt), ids: uuidIdGenerator };
  let generation = createGeneration(
    { projectId, capability: 'image.generate', prompt: 'a diver exploring a wreck' },
    genDeps,
  );
  generation = dispatchGeneration(
    generation,
    { provider: overrides.provider ?? 'anthropic', model: overrides.model ?? 'claude-image' },
    genDeps,
  );
  generation = completeGeneration(generation, { outputAssetIds }, genDeps);
  return generationRepo.insert(generation);
}

describe('asset library read model', () => {
  it('reports an uploaded asset as imported, with no generation at all', async () => {
    const project = await seedProject('Deep Fathom');
    const asset = await assets.upload(project.id, {
      kind: 'image',
      filename: 'reference.png',
      mimeType: 'image/png',
      content: Buffer.from('a'),
    });

    const page = await readModel.listByProject(project.id, {});

    expect(page.items.map((item) => item.id)).toEqual([asset.id]);
    expect(page.summaries).toEqual([{ assetId: asset.id, origin: 'imported', generation: null }]);
    expect(page.total).toBe(1);
  });

  it('reports a generated asset with its generation id, capability, provider and model', async () => {
    const project = await seedProject('Deep Fathom');
    const asset = await assets.upload(project.id, {
      kind: 'image',
      filename: 'portrait.png',
      mimeType: 'image/png',
      content: Buffer.from('a'),
    });
    const generation = await recordGeneration(project.id, [asset.id], '2026-01-01T00:00:00.000Z', {
      provider: 'anthropic',
      model: 'claude-image',
    });

    const page = await readModel.listByProject(project.id, {});

    expect(page.summaries).toEqual([
      {
        assetId: asset.id,
        origin: 'generated',
        generation: {
          generationId: generation.id,
          capability: 'image.generate',
          provider: 'anthropic',
          model: 'claude-image',
        },
      },
    ]);
  });

  it('reports the most recently created generation deterministically when more than one produced the asset', async () => {
    const project = await seedProject('Deep Fathom');
    const asset = await assets.upload(project.id, {
      kind: 'image',
      filename: 'portrait.png',
      mimeType: 'image/png',
      content: Buffer.from('a'),
    });
    await recordGeneration(project.id, [asset.id], '2026-01-01T00:00:00.000Z', {
      model: 'earlier-model',
    });
    const later = await recordGeneration(project.id, [asset.id], '2026-02-01T00:00:00.000Z', {
      model: 'later-model',
    });

    const page = await readModel.listByProject(project.id, {});

    expect(page.summaries[0]?.generation?.generationId).toBe(later.id);
    expect(page.summaries[0]?.generation?.model).toBe('later-model');
  });

  describe('project isolation', () => {
    it('never reports another project asset or its generation', async () => {
      const [a, b] = [await seedProject('A'), await seedProject('B')];
      const assetA = await assets.upload(a.id, {
        kind: 'image',
        filename: 'a.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      const assetB = await assets.upload(b.id, {
        kind: 'image',
        filename: 'b.png',
        mimeType: 'image/png',
        content: Buffer.from('b'),
      });
      await recordGeneration(a.id, [assetA.id], '2026-01-01T00:00:00.000Z');
      await recordGeneration(b.id, [assetB.id], '2026-01-01T00:00:00.000Z');

      const pageA = await readModel.listByProject(a.id, {});
      expect(pageA.items.map((item) => item.id)).toEqual([assetA.id]);
      expect(pageA.summaries[0]?.origin).toBe('generated');
      expect(pageA.total).toBe(1);
    });
  });

  describe('origin filter', () => {
    it('narrows to generated assets and reflects it in total', async () => {
      const project = await seedProject('Deep Fathom');
      const uploaded = await assets.upload(project.id, {
        kind: 'image',
        filename: 'uploaded.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      const generated = await assets.upload(project.id, {
        kind: 'image',
        filename: 'generated.png',
        mimeType: 'image/png',
        content: Buffer.from('b'),
      });
      await recordGeneration(project.id, [generated.id], '2026-01-01T00:00:00.000Z');

      const page = await readModel.listByProject(project.id, { origin: 'generated' });

      expect(page.items.map((item) => item.id)).toEqual([generated.id]);
      expect(page.total).toBe(1);
      expect(uploaded.id).not.toBe(generated.id);
    });

    it('narrows to imported assets and reflects it in total', async () => {
      const project = await seedProject('Deep Fathom');
      const uploaded = await assets.upload(project.id, {
        kind: 'image',
        filename: 'uploaded.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      const generated = await assets.upload(project.id, {
        kind: 'image',
        filename: 'generated.png',
        mimeType: 'image/png',
        content: Buffer.from('b'),
      });
      await recordGeneration(project.id, [generated.id], '2026-01-01T00:00:00.000Z');

      const page = await readModel.listByProject(project.id, { origin: 'imported' });

      expect(page.items.map((item) => item.id)).toEqual([uploaded.id]);
      expect(page.total).toBe(1);
    });
  });

  describe('query cost', () => {
    it('issues the same number of queries regardless of how many assets are on the page', async () => {
      const project = await seedProject('Deep Fathom');
      for (let i = 0; i < 20; i += 1) {
        const asset = await assets.upload(project.id, {
          kind: 'image',
          filename: `asset-${i}.png`,
          mimeType: 'image/png',
          content: Buffer.from(String(i)),
        });
        // Every other asset is generated, so the origin join has real work to do.
        if (i % 2 === 0) {
          await recordGeneration(project.id, [asset.id], '2026-01-01T00:00:00.000Z');
        }
      }

      const smallPage = await countQueries(client, () =>
        readModel.listByProject(project.id, { limit: 5 }),
      );
      const largePage = await countQueries(client, () =>
        readModel.listByProject(project.id, { limit: 20 }),
      );

      expect(largePage).toBe(smallPage);
    });
  });
});
