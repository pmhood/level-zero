import {
  ActivityService,
  ASSET_LINKED_ENTITIES_CAP,
  AssetSelectionService,
  AssetService,
  EntityRelationshipService,
  EntityService,
  ProjectService,
  ReviewTargetResolver,
  completeGeneration,
  createAssetMark,
  createGeneration,
  dispatchGeneration,
  fixedClock,
  systemClock,
  uuidIdGenerator,
  type AssetMarkKind,
  type Entity,
  type Generation,
  type Project,
} from '@level-zero/domain';
import { InMemoryObjectStorageProvider } from '@level-zero/domain/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DatabaseClient } from '../postgres/client';
import { assets as assetsTable } from '../schema/assets';
import { countQueries } from '../testing/query-counter';
import { connectTestDatabase, truncateDomainTables } from '../testing/test-database';
import { DrizzleActivityRepository } from './activity-repository';
import { buildLibraryWhere, DrizzleAssetLibraryReadModel } from './asset-library-read-model';
import { DrizzleAssetMarkRepository } from './asset-mark-repository';
import { DrizzleAssetRepository } from './asset-repository';
import { DrizzleAssetSelectionRepository } from './asset-selection-repository';
import { DrizzleEntityRelationshipRepository } from './entity-relationship-repository';
import { DrizzleEntityRepository } from './entity-repository';
import { DrizzleEntityVersionRepository } from './entity-version-repository';
import { DrizzleGenerationRepository } from './generation-repository';
import { DrizzleProjectRepository } from './project-repository';
import { DrizzlePrototypeVersionRepository } from './prototype-version-repository';

const deps = { clock: systemClock, ids: uuidIdGenerator };

let client: DatabaseClient;
let projectRepo: DrizzleProjectRepository;
let assetRepo: DrizzleAssetRepository;
let generationRepo: DrizzleGenerationRepository;
let markRepo: DrizzleAssetMarkRepository;
let readModel: DrizzleAssetLibraryReadModel;
let projects: ProjectService;
let entities: EntityService;
let relationships: EntityRelationshipService;
let assets: AssetService;
let selections: AssetSelectionService;
let storage: InMemoryObjectStorageProvider;
let activity: ActivityService;

beforeAll(async () => {
  client = await connectTestDatabase();
  projectRepo = new DrizzleProjectRepository(client.db);
  assetRepo = new DrizzleAssetRepository(client.db);
  generationRepo = new DrizzleGenerationRepository(client.db);
  markRepo = new DrizzleAssetMarkRepository(client.db);
  readModel = new DrizzleAssetLibraryReadModel(client.db);
  projects = new ProjectService(projectRepo, deps);

  const entityRepo = new DrizzleEntityRepository(client.db);
  activity = new ActivityService(new DrizzleActivityRepository(client.db), deps);
  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  relationships = new EntityRelationshipService(
    new DrizzleEntityRelationshipRepository(client.db),
    entityRepo,
    deps,
  );

  const targets = new ReviewTargetResolver(
    entityRepo,
    assetRepo,
    new DrizzlePrototypeVersionRepository(client.db),
    new DrizzleEntityVersionRepository(client.db),
  );
  selections = new AssetSelectionService(
    new DrizzleAssetSelectionRepository(client.db),
    markRepo,
    targets,
    deps,
  );
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

/**
 * Marks an asset with the given kind.
 */
async function markAsset(projectId: string, assetId: string, kind: AssetMarkKind): Promise<void> {
  const mark = createAssetMark(
    { projectId, assetId, kind, actor: 'test' },
    { clock: systemClock, ids: uuidIdGenerator },
  );
  await markRepo.add(mark);
}

/**
 * Points `assetId`'s `asset_reference` entity (creating it if needed) at
 * `entityId` with a relationship edge, the same two writes the app makes to
 * link an asset into the entity graph.
 */
async function linkAssetToEntity(
  projectId: string,
  assetId: string,
  entityId: string,
): Promise<Entity> {
  const reference = await entities.findOrCreateAssetReference(projectId, assetId, {
    name: 'asset reference',
  });
  await relationships.link(projectId, {
    sourceEntityId: entityId,
    targetEntityId: reference.id,
    relation: 'references',
  });
  return reference;
}

/**
 * Files `assetId` into `collectionId`, the same two writes
 * `AssetCollectionService.addAsset` makes: find-or-create the asset's
 * reference, then a `contains` edge from the collection to it.
 */
async function addAssetToCollection(
  projectId: string,
  collectionId: string,
  assetId: string,
): Promise<void> {
  const reference = await entities.findOrCreateAssetReference(projectId, assetId, {
    name: 'asset reference',
  });
  await relationships.link(projectId, {
    sourceEntityId: collectionId,
    targetEntityId: reference.id,
    relation: 'contains',
  });
}

/**
 * Files `assetId` into `collectionId` with a `contains` edge stamped at
 * `createdAt`, so a test can control which member is "newest" without
 * relying on wall-clock timing between two inserts a real test runs in
 * microseconds apart.
 */
async function addAssetToCollectionAt(
  projectId: string,
  collectionId: string,
  assetId: string,
  createdAt: string,
): Promise<void> {
  const reference = await entities.findOrCreateAssetReference(projectId, assetId, {
    name: 'asset reference',
  });
  const relationshipsAt = new EntityRelationshipService(
    new DrizzleEntityRelationshipRepository(client.db),
    new DrizzleEntityRepository(client.db),
    { clock: fixedClock(createdAt), ids: uuidIdGenerator },
  );
  await relationshipsAt.link(projectId, {
    sourceEntityId: collectionId,
    targetEntityId: reference.id,
    relation: 'contains',
  });
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
    expect(page.summaries).toEqual([
      {
        assetId: asset.id,
        origin: 'imported',
        generation: null,
        markKinds: [],
        selections: [],
        approved: false,
        linkedEntities: { entities: [], total: 0 },
        thumbnailAssetId: null,
      },
    ]);
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
        markKinds: [],
        selections: [],
        approved: false,
        linkedEntities: { entities: [], total: 0 },
        thumbnailAssetId: null,
      },
    ]);
  });

  it("carries a source's thumbnail id and excludes the thumbnail as a row of its own (#176)", async () => {
    const project = await seedProject('Deep Fathom');
    const source = await assets.upload(project.id, {
      kind: 'image',
      filename: 'portrait.png',
      mimeType: 'image/png',
      content: Buffer.from('a'),
    });
    const thumbnail = await assets.upload(project.id, {
      kind: 'image',
      filename: 'portrait-thumb.webp',
      mimeType: 'image/webp',
      content: Buffer.from('thumb'),
      variant: 'thumbnail',
      sourceAssetId: source.id,
    });

    const page = await readModel.listByProject(project.id, {});

    expect(page.items.map((item) => item.id)).toEqual([source.id]);
    expect(page.summaries[0]?.thumbnailAssetId).toBe(thumbnail.id);
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
    /**
     * Counts statements, not their cost — the origin filter's `EXISTS`
     * condition is folded into the same page/count statements `buildAssetWhere`
     * already issues, so it cannot change this number even if it planned as a
     * sequential scan of every generation in the project. That regression is
     * covered separately, below, by asserting the plan itself.
     */
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

      // Same shape again, but exercising the origin filter's own extra
      // condition rather than only the unfiltered path.
      const smallGenerated = await countQueries(client, () =>
        readModel.listByProject(project.id, { limit: 5, origin: 'generated' }),
      );
      const largeGenerated = await countQueries(client, () =>
        readModel.listByProject(project.id, { limit: 20, origin: 'generated' }),
      );
      expect(largeGenerated).toBe(smallGenerated);
    });
  });

  describe('origin filter query plan', () => {
    it('compiles the origin check to the indexable containment operator, not a scalar array comparison', () => {
      const where = buildLibraryWhere('11111111-1111-1111-1111-111111111111', {
        origin: 'generated',
      });
      const { sql: text } = client.db.select().from(assetsTable).where(where).toSQL();

      expect(text).toContain('@>');
      expect(text.toLowerCase()).not.toMatch(/=\s*any\s*\(/);
    });
  });

  describe('mark kinds', () => {
    it('reports an empty array for an asset with no marks', async () => {
      const project = await seedProject('Deep Fathom');
      const asset = await assets.upload(project.id, {
        kind: 'image',
        filename: 'reference.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });

      const page = await readModel.listByProject(project.id, {});

      expect(page.items[0]?.id).toBe(asset.id);
      expect(page.summaries[0]?.markKinds).toEqual([]);
    });

    it('reports both mark kinds when an asset has both', async () => {
      const project = await seedProject('Deep Fathom');
      const asset = await assets.upload(project.id, {
        kind: 'image',
        filename: 'reference.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      await markAsset(project.id, asset.id, 'favorite');
      await markAsset(project.id, asset.id, 'shortlisted');

      const page = await readModel.listByProject(project.id, {});

      expect(page.summaries[0]?.markKinds).toEqual(['favorite', 'shortlisted']);
    });

    it('narrows to assets with any of the requested kinds', async () => {
      const project = await seedProject('Deep Fathom');
      const favorited = await assets.upload(project.id, {
        kind: 'image',
        filename: 'favorited.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      const shortlisted = await assets.upload(project.id, {
        kind: 'image',
        filename: 'shortlisted.png',
        mimeType: 'image/png',
        content: Buffer.from('b'),
      });
      const unmarked = await assets.upload(project.id, {
        kind: 'image',
        filename: 'unmarked.png',
        mimeType: 'image/png',
        content: Buffer.from('c'),
      });

      await markAsset(project.id, favorited.id, 'favorite');
      await markAsset(project.id, shortlisted.id, 'shortlisted');

      const page = await readModel.listByProject(project.id, {
        markKinds: ['favorite', 'shortlisted'],
      });

      expect(page.items.map((item) => item.id)).toEqual(
        expect.arrayContaining([favorited.id, shortlisted.id]),
      );
      expect(page.items).toHaveLength(2);
      expect(page.total).toBe(2);
      expect(unmarked.id).not.toBe(favorited.id);
      expect(unmarked.id).not.toBe(shortlisted.id);
    });

    it('narrows by a single mark kind', async () => {
      const project = await seedProject('Deep Fathom');
      const favorited = await assets.upload(project.id, {
        kind: 'image',
        filename: 'favorited.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      const shortlisted = await assets.upload(project.id, {
        kind: 'image',
        filename: 'shortlisted.png',
        mimeType: 'image/png',
        content: Buffer.from('b'),
      });

      await markAsset(project.id, favorited.id, 'favorite');
      await markAsset(project.id, shortlisted.id, 'shortlisted');

      const page = await readModel.listByProject(project.id, { markKinds: ['favorite'] });

      expect(page.items.map((item) => item.id)).toEqual([favorited.id]);
      expect(page.total).toBe(1);
    });

    it('never reports another project asset marks', async () => {
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
      await markAsset(a.id, assetA.id, 'favorite');
      await markAsset(b.id, assetB.id, 'favorite');

      const pageA = await readModel.listByProject(a.id, {
        markKinds: ['favorite'],
      });
      expect(pageA.items.map((item) => item.id)).toEqual([assetA.id]);
      expect(pageA.total).toBe(1);

      const pageB = await readModel.listByProject(b.id, {
        markKinds: ['favorite'],
      });
      expect(pageB.items.map((item) => item.id)).toEqual([assetB.id]);
      expect(pageB.total).toBe(1);
    });

    it('issues the same number of queries regardless of how many assets are on the page when filtering by marks', async () => {
      const project = await seedProject('Deep Fathom');
      for (let i = 0; i < 20; i += 1) {
        const asset = await assets.upload(project.id, {
          kind: 'image',
          filename: `asset-${i}.png`,
          mimeType: 'image/png',
          content: Buffer.from(String(i)),
        });
        // Every other asset is marked as favorite
        if (i % 2 === 0) {
          await markAsset(project.id, asset.id, 'favorite');
        }
      }

      const smallPage = await countQueries(client, () =>
        readModel.listByProject(project.id, { limit: 5, markKinds: ['favorite'] }),
      );
      const largePage = await countQueries(client, () =>
        readModel.listByProject(project.id, { limit: 20, markKinds: ['favorite'] }),
      );
      expect(largePage).toBe(smallPage);
    });
  });

  describe('selections', () => {
    it('reports an empty list and unapproved for an asset that was never selected', async () => {
      const project = await seedProject('Deep Fathom');
      const asset = await assets.upload(project.id, {
        kind: 'image',
        filename: 'reference.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });

      const page = await readModel.listByProject(project.id, {});

      expect(page.summaries[0]).toMatchObject({
        assetId: asset.id,
        selections: [],
        approved: false,
      });
    });

    it('reports an approval and a rejection for the same asset in different contexts, both true underneath one summary', async () => {
      const project = await seedProject('Deep Fathom');
      const diver = await entities.create(project.id, { type: 'character', name: 'The Diver' });
      const wreck = await entities.create(project.id, { type: 'location', name: 'The Wreck' });
      const asset = await assets.upload(project.id, {
        kind: 'image',
        filename: 'concept.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });

      const portrait = { entityId: diver.id, purpose: 'portrait' };
      const backdrop = { entityId: wreck.id, purpose: 'backdrop' };
      await selections.approve(project.id, { assetId: asset.id, context: portrait, actor: 'ada' });
      await selections.reject(project.id, { assetId: asset.id, context: backdrop, actor: 'ada' });

      const page = await readModel.listByProject(project.id, {});
      const summary = page.summaries.find((entry) => entry.assetId === asset.id);

      expect(summary?.approved).toBe(true);
      expect(summary?.selections).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ context: portrait, state: 'approved' }),
          expect.objectContaining({ context: backdrop, state: 'rejected' }),
        ]),
      );
      expect(summary?.selections).toHaveLength(2);

      const approvedOnly = await readModel.listByProject(project.id, {
        selectionStates: ['approved'],
      });
      expect(approvedOnly.items.map((item) => item.id)).toEqual([asset.id]);

      const rejectedOnly = await readModel.listByProject(project.id, {
        selectionStates: ['rejected'],
      });
      expect(rejectedOnly.items.map((item) => item.id)).toEqual([asset.id]);
    });

    /**
     * The naive implementation this guards against: "does an approved row
     * exist for this asset?" That query would still see `assetA`'s original
     * approval — it is never deleted — and wrongly report it as currently
     * approved and match the `approved` filter. Folding to the newest row
     * per context first (what `hasSelectionInStates` and `selectionsFor` both
     * do, via `latestSelectionByAsset`) is what makes `assetA` read as
     * `superseded` instead, and drop out of the `approved` filter.
     */
    it('reports superseded, not approved, for an asset whose approval was replaced — and does not match the approved filter on it', async () => {
      const project = await seedProject('Deep Fathom');
      const diver = await entities.create(project.id, { type: 'character', name: 'The Diver' });
      const context = { entityId: diver.id, purpose: 'portrait' };
      const [assetA, assetB] = await Promise.all([
        assets.upload(project.id, {
          kind: 'image',
          filename: 'a.png',
          mimeType: 'image/png',
          content: Buffer.from('a'),
        }),
        assets.upload(project.id, {
          kind: 'image',
          filename: 'b.png',
          mimeType: 'image/png',
          content: Buffer.from('b'),
        }),
      ]);

      await selections.approve(project.id, { assetId: assetA!.id, context, actor: 'ada' });
      await selections.approve(project.id, {
        assetId: assetB!.id,
        context,
        actor: 'ada',
        supersedes: [assetA!.id],
      });

      const page = await readModel.listByProject(project.id, {});
      const summaryA = page.summaries.find((entry) => entry.assetId === assetA!.id);
      const summaryB = page.summaries.find((entry) => entry.assetId === assetB!.id);

      expect(summaryA?.selections).toEqual([
        expect.objectContaining({ context, state: 'superseded' }),
      ]);
      expect(summaryA?.approved).toBe(false);
      expect(summaryB?.selections).toEqual([
        expect.objectContaining({ context, state: 'approved' }),
      ]);
      expect(summaryB?.approved).toBe(true);

      const approvedOnly = await readModel.listByProject(project.id, {
        selectionStates: ['approved'],
      });
      expect(approvedOnly.items.map((item) => item.id)).toEqual([assetB!.id]);
      expect(approvedOnly.total).toBe(1);

      const supersededOnly = await readModel.listByProject(project.id, {
        selectionStates: ['superseded'],
      });
      expect(supersededOnly.items.map((item) => item.id)).toEqual([assetA!.id]);
      expect(supersededOnly.total).toBe(1);
    });

    it('never reports another project selections', async () => {
      const [a, b] = [await seedProject('A'), await seedProject('B')];
      const [entityA, entityB] = await Promise.all([
        entities.create(a.id, { type: 'character', name: 'A Character' }),
        entities.create(b.id, { type: 'character', name: 'B Character' }),
      ]);
      const [assetA, assetB] = await Promise.all([
        assets.upload(a.id, {
          kind: 'image',
          filename: 'a.png',
          mimeType: 'image/png',
          content: Buffer.from('a'),
        }),
        assets.upload(b.id, {
          kind: 'image',
          filename: 'b.png',
          mimeType: 'image/png',
          content: Buffer.from('b'),
        }),
      ]);
      await selections.approve(a.id, {
        assetId: assetA.id,
        context: { entityId: entityA.id, purpose: 'portrait' },
        actor: 'ada',
      });
      await selections.approve(b.id, {
        assetId: assetB.id,
        context: { entityId: entityB.id, purpose: 'portrait' },
        actor: 'ada',
      });

      const pageA = await readModel.listByProject(a.id, { selectionStates: ['approved'] });
      expect(pageA.items.map((item) => item.id)).toEqual([assetA.id]);
      expect(pageA.total).toBe(1);

      const pageB = await readModel.listByProject(b.id, { selectionStates: ['approved'] });
      expect(pageB.items.map((item) => item.id)).toEqual([assetB.id]);
      expect(pageB.total).toBe(1);
    });

    it('issues the same number of queries regardless of how many assets are on the page when filtering by selection state', async () => {
      const project = await seedProject('Deep Fathom');
      const diver = await entities.create(project.id, { type: 'character', name: 'The Diver' });
      for (let i = 0; i < 20; i += 1) {
        const asset = await assets.upload(project.id, {
          kind: 'image',
          filename: `asset-${i}.png`,
          mimeType: 'image/png',
          content: Buffer.from(String(i)),
        });
        // Every other asset is approved for the same context.
        if (i % 2 === 0) {
          await selections.approve(project.id, {
            assetId: asset.id,
            context: { entityId: diver.id, purpose: 'portrait' },
            actor: 'ada',
          });
        }
      }

      const smallPage = await countQueries(client, () =>
        readModel.listByProject(project.id, { limit: 5 }),
      );
      const largePage = await countQueries(client, () =>
        readModel.listByProject(project.id, { limit: 20 }),
      );
      expect(largePage).toBe(smallPage);

      const smallApproved = await countQueries(client, () =>
        readModel.listByProject(project.id, { limit: 5, selectionStates: ['approved'] }),
      );
      const largeApproved = await countQueries(client, () =>
        readModel.listByProject(project.id, { limit: 20, selectionStates: ['approved'] }),
      );
      expect(largeApproved).toBe(smallApproved);
    });
  });

  describe('linked entities', () => {
    it('reports zero linked entities for an asset with no asset_reference entity at all', async () => {
      const project = await seedProject('Deep Fathom');
      const asset = await assets.upload(project.id, {
        kind: 'image',
        filename: 'reference.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });

      const page = await readModel.listByProject(project.id, {});

      expect(page.summaries[0]).toMatchObject({
        assetId: asset.id,
        linkedEntities: { entities: [], total: 0 },
      });
    });

    it('reports zero linked entities for an asset whose asset_reference entity relates to nothing', async () => {
      const project = await seedProject('Deep Fathom');
      const asset = await assets.upload(project.id, {
        kind: 'image',
        filename: 'reference.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      // Creates the `asset_reference` entity but never relates it to anything.
      await entities.findOrCreateAssetReference(project.id, asset.id, { name: 'asset reference' });

      const page = await readModel.listByProject(project.id, {});

      expect(page.summaries[0]).toMatchObject({
        assetId: asset.id,
        linkedEntities: { entities: [], total: 0 },
      });
    });

    /**
     * The naive implementation this guards against: one row per relationship
     * edge. Two edges relate the same character to the same asset — one in
     * each direction — so a query that joined without deduping would report
     * the character twice and a total of two, not one.
     */
    it('reports an entity linked by more than one edge once, with a total of one', async () => {
      const project = await seedProject('Deep Fathom');
      const asset = await assets.upload(project.id, {
        kind: 'image',
        filename: 'portrait.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      const kira = await entities.create(project.id, { type: 'character', name: 'Kira' });
      const reference = await linkAssetToEntity(project.id, asset.id, kira.id);
      // A second, independent edge between the same pair, in the other direction.
      await relationships.link(project.id, {
        sourceEntityId: reference.id,
        targetEntityId: kira.id,
        relation: 'appears_in',
      });

      const page = await readModel.listByProject(project.id, {});

      expect(page.summaries[0]?.linkedEntities).toEqual({
        entities: [{ entityId: kira.id, type: 'character', name: 'Kira' }],
        total: 1,
      });
    });

    it('never counts the asset_reference entity itself as a linked entity', async () => {
      const project = await seedProject('Deep Fathom');
      const asset = await assets.upload(project.id, {
        kind: 'image',
        filename: 'portrait.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      const kira = await entities.create(project.id, { type: 'character', name: 'Kira' });
      await linkAssetToEntity(project.id, asset.id, kira.id);

      const page = await readModel.listByProject(project.id, {});

      expect(page.summaries[0]?.linkedEntities.total).toBe(1);
      expect(page.summaries[0]?.linkedEntities.entities.map((entity) => entity.entityId)).toEqual([
        kira.id,
      ]);
    });

    /**
     * The naive implementation this guards against: reporting only
     * `ASSET_LINKED_ENTITIES_CAP` rows with no separate count, so an asset
     * used by more entities than the cap looks identical to one used by
     * exactly the cap's worth.
     */
    it('reports the cap worth of entities plus an accurate total when over the cap', async () => {
      const project = await seedProject('Deep Fathom');
      const asset = await assets.upload(project.id, {
        kind: 'image',
        filename: 'portrait.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });

      const names = ['Ada', 'Bram', 'Cato', 'Dana', 'Elle', 'Finn'].slice(
        0,
        ASSET_LINKED_ENTITIES_CAP + 2,
      );
      for (const name of names) {
        const character = await entities.create(project.id, { type: 'character', name });
        await linkAssetToEntity(project.id, asset.id, character.id);
      }

      const page = await readModel.listByProject(project.id, {});
      const summary = page.summaries[0]?.linkedEntities;

      expect(summary?.total).toBe(names.length);
      expect(summary?.entities).toHaveLength(ASSET_LINKED_ENTITIES_CAP);
      expect(summary?.entities.map((entity) => entity.name)).toEqual(
        [...names].sort().slice(0, ASSET_LINKED_ENTITIES_CAP),
      );
    });

    it('never reports another project linked entities', async () => {
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
      const characterA = await entities.create(a.id, { type: 'character', name: 'A Character' });
      const characterB = await entities.create(b.id, { type: 'character', name: 'B Character' });
      await linkAssetToEntity(a.id, assetA.id, characterA.id);
      await linkAssetToEntity(b.id, assetB.id, characterB.id);

      const pageA = await readModel.listByProject(a.id, {});
      const summaryA = pageA.summaries.find((entry) => entry.assetId === assetA.id);
      expect(summaryA?.linkedEntities).toEqual({
        entities: [{ entityId: characterA.id, type: 'character', name: 'A Character' }],
        total: 1,
      });

      const pageB = await readModel.listByProject(b.id, {});
      const summaryB = pageB.summaries.find((entry) => entry.assetId === assetB.id);
      expect(summaryB?.linkedEntities).toEqual({
        entities: [{ entityId: characterB.id, type: 'character', name: 'B Character' }],
        total: 1,
      });
    });

    describe('linkedEntityId filter', () => {
      it('narrows to assets reachable from the given entity and reflects it in total', async () => {
        const project = await seedProject('Deep Fathom');
        const linked = await assets.upload(project.id, {
          kind: 'image',
          filename: 'linked.png',
          mimeType: 'image/png',
          content: Buffer.from('a'),
        });
        const unlinked = await assets.upload(project.id, {
          kind: 'image',
          filename: 'unlinked.png',
          mimeType: 'image/png',
          content: Buffer.from('b'),
        });
        const kira = await entities.create(project.id, { type: 'character', name: 'Kira' });
        await linkAssetToEntity(project.id, linked.id, kira.id);

        const page = await readModel.listByProject(project.id, { linkedEntityId: kira.id });

        expect(page.items.map((item) => item.id)).toEqual([linked.id]);
        expect(page.total).toBe(1);
        expect(unlinked.id).not.toBe(linked.id);
      });

      it('never reports another project asset as reachable from one of its entities', async () => {
        const [a, b] = [await seedProject('A'), await seedProject('B')];
        const assetA = await assets.upload(a.id, {
          kind: 'image',
          filename: 'a.png',
          mimeType: 'image/png',
          content: Buffer.from('a'),
        });
        const characterA = await entities.create(a.id, { type: 'character', name: 'A Character' });
        await linkAssetToEntity(a.id, assetA.id, characterA.id);

        const pageB = await readModel.listByProject(b.id, { linkedEntityId: characterA.id });

        expect(pageB.items).toHaveLength(0);
        expect(pageB.total).toBe(0);
      });
    });

    it('issues the same number of queries regardless of how many assets are on the page', async () => {
      const project = await seedProject('Deep Fathom');
      const kira = await entities.create(project.id, { type: 'character', name: 'Kira' });
      for (let i = 0; i < 20; i += 1) {
        const asset = await assets.upload(project.id, {
          kind: 'image',
          filename: `asset-${i}.png`,
          mimeType: 'image/png',
          content: Buffer.from(String(i)),
        });
        // Every other asset is linked to the same entity.
        if (i % 2 === 0) {
          await linkAssetToEntity(project.id, asset.id, kira.id);
        }
      }

      const smallPage = await countQueries(client, () =>
        readModel.listByProject(project.id, { limit: 5 }),
      );
      const largePage = await countQueries(client, () =>
        readModel.listByProject(project.id, { limit: 20 }),
      );
      expect(largePage).toBe(smallPage);

      const smallLinked = await countQueries(client, () =>
        readModel.listByProject(project.id, { limit: 5, linkedEntityId: kira.id }),
      );
      const largeLinked = await countQueries(client, () =>
        readModel.listByProject(project.id, { limit: 20, linkedEntityId: kira.id }),
      );
      expect(largeLinked).toBe(smallLinked);
    });
  });

  describe('collectionId filter', () => {
    it('narrows to assets filed in the given collection and reflects it in total', async () => {
      const project = await seedProject('Deep Fathom');
      const propsCollection = await entities.create(project.id, {
        type: 'asset_collection',
        name: 'Props & Gear',
      });
      const inCollection = await assets.upload(project.id, {
        kind: 'image',
        filename: 'in.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      const notInCollection = await assets.upload(project.id, {
        kind: 'image',
        filename: 'out.png',
        mimeType: 'image/png',
        content: Buffer.from('b'),
      });
      await addAssetToCollection(project.id, propsCollection.id, inCollection.id);

      const page = await readModel.listByProject(project.id, {
        collectionId: propsCollection.id,
      });

      expect(page.items.map((item) => item.id)).toEqual([inCollection.id]);
      expect(page.total).toBe(1);
      expect(notInCollection.id).not.toBe(inCollection.id);
    });

    it('reports the same asset as a member of two collections', async () => {
      const project = await seedProject('Deep Fathom');
      const propsCollection = await entities.create(project.id, {
        type: 'asset_collection',
        name: 'Props & Gear',
      });
      const uiCollection = await entities.create(project.id, {
        type: 'asset_collection',
        name: 'UI & HUD',
      });
      const asset = await assets.upload(project.id, {
        kind: 'image',
        filename: 'icon.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      await addAssetToCollection(project.id, propsCollection.id, asset.id);
      await addAssetToCollection(project.id, uiCollection.id, asset.id);

      const [inProps, inUi] = await Promise.all([
        readModel.listByProject(project.id, { collectionId: propsCollection.id }),
        readModel.listByProject(project.id, { collectionId: uiCollection.id }),
      ]);

      expect(inProps.items.map((item) => item.id)).toEqual([asset.id]);
      expect(inUi.items.map((item) => item.id)).toEqual([asset.id]);
    });

    it('never reports another project asset as a member of one of its collections', async () => {
      const [a, b] = [await seedProject('A'), await seedProject('B')];
      const collectionA = await entities.create(a.id, {
        type: 'asset_collection',
        name: 'Collection A',
      });
      const assetA = await assets.upload(a.id, {
        kind: 'image',
        filename: 'a.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      await addAssetToCollection(a.id, collectionA.id, assetA.id);

      const pageB = await readModel.listByProject(b.id, { collectionId: collectionA.id });

      expect(pageB.items).toHaveLength(0);
      expect(pageB.total).toBe(0);
    });
  });

  describe('pipelineStages filter', () => {
    it('narrows to assets in the given stages and reflects it in total', async () => {
      const project = await seedProject('Deep Fathom');
      const concept = await assets.upload(project.id, {
        kind: 'image',
        filename: 'concept.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      const inProgress = await assets.upload(project.id, {
        kind: 'image',
        filename: 'in-progress.png',
        mimeType: 'image/png',
        content: Buffer.from('b'),
      });
      await assets.setPipelineStage(project.id, inProgress.id, 'in_progress');

      const page = await readModel.listByProject(project.id, {
        pipelineStages: ['in_progress'],
      });

      expect(page.items.map((item) => item.id)).toEqual([inProgress.id]);
      expect(page.total).toBe(1);
      expect(concept.id).not.toBe(inProgress.id);
    });

    it('never reports another project asset', async () => {
      const [a, b] = [await seedProject('A'), await seedProject('B')];
      const assetA = await assets.upload(a.id, {
        kind: 'image',
        filename: 'a.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      await assets.setPipelineStage(a.id, assetA.id, 'production_ready');

      const pageB = await readModel.listByProject(b.id, { pipelineStages: ['production_ready'] });

      expect(pageB.items).toHaveLength(0);
      expect(pageB.total).toBe(0);
    });
  });

  describe('countsByStage', () => {
    it('counts active source assets per stage, in one grouped read', async () => {
      const project = await seedProject('Deep Fathom');
      const [, b, c] = await Promise.all([
        assets.upload(project.id, {
          kind: 'image',
          filename: 'a.png',
          mimeType: 'image/png',
          content: Buffer.from('a'),
        }),
        assets.upload(project.id, {
          kind: 'image',
          filename: 'b.png',
          mimeType: 'image/png',
          content: Buffer.from('b'),
        }),
        assets.upload(project.id, {
          kind: 'image',
          filename: 'c.png',
          mimeType: 'image/png',
          content: Buffer.from('c'),
        }),
      ]);
      await assets.setPipelineStage(project.id, b.id, 'in_progress');
      await assets.setPipelineStage(project.id, c.id, 'production_ready');

      const counts = await readModel.countsByStage(project.id);

      expect(counts).toEqual({ concept: 1, in_progress: 1, production_ready: 1 });
    });

    it('excludes an archived asset from its stage count', async () => {
      const project = await seedProject('Deep Fathom');
      const asset = await assets.upload(project.id, {
        kind: 'image',
        filename: 'a.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      await assets.archive(project.id, asset.id);

      const counts = await readModel.countsByStage(project.id);

      expect(counts.concept).toBeUndefined();
    });

    it('omits a stage with no active assets rather than reporting zero', async () => {
      const project = await seedProject('Deep Fathom');

      const counts = await readModel.countsByStage(project.id);

      expect(counts.production_ready).toBeUndefined();
    });

    it('never counts another project into this one', async () => {
      const [a, b] = [await seedProject('A'), await seedProject('B')];
      await assets.upload(a.id, {
        kind: 'image',
        filename: 'a.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });

      const countsB = await readModel.countsByStage(b.id);

      expect(countsB).toEqual({});
    });
  });

  describe('countsByCollection', () => {
    it('counts active members per collection in one grouped read', async () => {
      const project = await seedProject('Deep Fathom');
      const propsCollection = await entities.create(project.id, {
        type: 'asset_collection',
        name: 'Props & Gear',
      });
      const uiCollection = await entities.create(project.id, {
        type: 'asset_collection',
        name: 'UI & HUD',
      });
      const [first, second, third] = await Promise.all([
        assets.upload(project.id, {
          kind: 'image',
          filename: 'a.png',
          mimeType: 'image/png',
          content: Buffer.from('a'),
        }),
        assets.upload(project.id, {
          kind: 'image',
          filename: 'b.png',
          mimeType: 'image/png',
          content: Buffer.from('b'),
        }),
        assets.upload(project.id, {
          kind: 'image',
          filename: 'c.png',
          mimeType: 'image/png',
          content: Buffer.from('c'),
        }),
      ]);
      await addAssetToCollection(project.id, propsCollection.id, first.id);
      await addAssetToCollection(project.id, propsCollection.id, second.id);
      await addAssetToCollection(project.id, uiCollection.id, third.id);

      const counts = await readModel.countsByCollection(project.id);

      expect(counts).toEqual({
        [propsCollection.id]: 2,
        [uiCollection.id]: 1,
      });
    });

    it('excludes an archived member from its collection count', async () => {
      const project = await seedProject('Deep Fathom');
      const propsCollection = await entities.create(project.id, {
        type: 'asset_collection',
        name: 'Props & Gear',
      });
      const asset = await assets.upload(project.id, {
        kind: 'image',
        filename: 'a.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      await addAssetToCollection(project.id, propsCollection.id, asset.id);
      await assets.archive(project.id, asset.id);

      const counts = await readModel.countsByCollection(project.id);

      expect(counts[propsCollection.id]).toBeUndefined();
    });

    it('omits a collection with no active members rather than reporting zero', async () => {
      const project = await seedProject('Deep Fathom');
      const emptyCollection = await entities.create(project.id, {
        type: 'asset_collection',
        name: 'Empty',
      });

      const counts = await readModel.countsByCollection(project.id);

      expect(counts[emptyCollection.id]).toBeUndefined();
    });

    it('never counts another project into this one', async () => {
      const [a, b] = [await seedProject('A'), await seedProject('B')];
      const collectionA = await entities.create(a.id, {
        type: 'asset_collection',
        name: 'Collection A',
      });
      const assetA = await assets.upload(a.id, {
        kind: 'image',
        filename: 'a.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      await addAssetToCollection(a.id, collectionA.id, assetA.id);

      const countsB = await readModel.countsByCollection(b.id);

      expect(countsB).toEqual({});
    });

    it('agrees with the listing total for the same collection', async () => {
      const project = await seedProject('Deep Fathom');
      const propsCollection = await entities.create(project.id, {
        type: 'asset_collection',
        name: 'Props & Gear',
      });
      const [first, second] = await Promise.all([
        assets.upload(project.id, {
          kind: 'image',
          filename: 'a.png',
          mimeType: 'image/png',
          content: Buffer.from('a'),
        }),
        assets.upload(project.id, {
          kind: 'image',
          filename: 'b.png',
          mimeType: 'image/png',
          content: Buffer.from('b'),
        }),
      ]);
      await addAssetToCollection(project.id, propsCollection.id, first.id);
      await addAssetToCollection(project.id, propsCollection.id, second.id);

      const counts = await readModel.countsByCollection(project.id);
      const page = await readModel.listByProject(project.id, {
        collectionId: propsCollection.id,
      });

      expect(counts[propsCollection.id]).toBe(page.total);
    });
  });

  describe('coversByCollection', () => {
    it('reports the newest active member as the cover, by the membership edge createdAt', async () => {
      const project = await seedProject('Deep Fathom');
      const propsCollection = await entities.create(project.id, {
        type: 'asset_collection',
        name: 'Props & Gear',
      });
      const older = await assets.upload(project.id, {
        kind: 'image',
        filename: 'a.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      const newer = await assets.upload(project.id, {
        kind: 'image',
        filename: 'b.png',
        mimeType: 'image/png',
        content: Buffer.from('b'),
      });
      // Filed out of chronological order, so a naive "last inserted" read
      // would get this wrong — only the edge's own createdAt should decide.
      await addAssetToCollectionAt(
        project.id,
        propsCollection.id,
        newer.id,
        '2026-01-01T00:00:00.000Z',
      );
      await addAssetToCollectionAt(
        project.id,
        propsCollection.id,
        older.id,
        '2026-01-02T00:00:00.000Z',
      );

      const covers = await readModel.coversByCollection(project.id);

      expect(covers[propsCollection.id]?.id).toBe(older.id);
    });

    it('falls back to the next-newest member once the newest is archived', async () => {
      const project = await seedProject('Deep Fathom');
      const propsCollection = await entities.create(project.id, {
        type: 'asset_collection',
        name: 'Props & Gear',
      });
      const older = await assets.upload(project.id, {
        kind: 'image',
        filename: 'a.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      const newer = await assets.upload(project.id, {
        kind: 'image',
        filename: 'b.png',
        mimeType: 'image/png',
        content: Buffer.from('b'),
      });
      await addAssetToCollectionAt(
        project.id,
        propsCollection.id,
        older.id,
        '2026-01-01T00:00:00.000Z',
      );
      await addAssetToCollectionAt(
        project.id,
        propsCollection.id,
        newer.id,
        '2026-01-02T00:00:00.000Z',
      );
      await assets.archive(project.id, newer.id);

      const covers = await readModel.coversByCollection(project.id);

      expect(covers[propsCollection.id]?.id).toBe(older.id);
    });

    it('omits a collection with no active members rather than reporting one', async () => {
      const project = await seedProject('Deep Fathom');
      const emptyCollection = await entities.create(project.id, {
        type: 'asset_collection',
        name: 'Empty',
      });

      const covers = await readModel.coversByCollection(project.id);

      expect(covers[emptyCollection.id]).toBeUndefined();
    });

    it('never reports another project asset as a cover', async () => {
      const [a, b] = [await seedProject('A'), await seedProject('B')];
      const collectionA = await entities.create(a.id, {
        type: 'asset_collection',
        name: 'Collection A',
      });
      const assetA = await assets.upload(a.id, {
        kind: 'image',
        filename: 'a.png',
        mimeType: 'image/png',
        content: Buffer.from('a'),
      });
      await addAssetToCollection(a.id, collectionA.id, assetA.id);

      const coversB = await readModel.coversByCollection(b.id);

      expect(coversB).toEqual({});
    });
  });
});
