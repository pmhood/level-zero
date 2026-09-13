import {
  ActivityService,
  AssetSelectionService,
  AssetService,
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
  type Generation,
  type Project,
} from '@level-zero/domain';
import { InMemoryObjectStorageProvider } from '@level-zero/domain/testing';
import { sql } from 'drizzle-orm';
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
let assets: AssetService;
let selections: AssetSelectionService;
let storage: InMemoryObjectStorageProvider;

beforeAll(async () => {
  client = await connectTestDatabase();
  projectRepo = new DrizzleProjectRepository(client.db);
  assetRepo = new DrizzleAssetRepository(client.db);
  generationRepo = new DrizzleGenerationRepository(client.db);
  markRepo = new DrizzleAssetMarkRepository(client.db);
  readModel = new DrizzleAssetLibraryReadModel(client.db);
  projects = new ProjectService(projectRepo, deps);

  const entityRepo = new DrizzleEntityRepository(client.db);
  const activity = new ActivityService(new DrizzleActivityRepository(client.db), deps);
  entities = new EntityService(entityRepo, projectRepo, activity, deps);

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

/**
 * Bulk-inserts `count` unrelated, completed generations directly (bypassing
 * the domain factory, which would be 3000 sequential round trips for what is
 * pure filler) so the origin filter has enough rows in `generations` for the
 * planner's row-count estimates to matter — the same order of magnitude the
 * reviewer reproduced the seq-scan regression with.
 */
async function seedFillerGenerations(projectId: string, count: number): Promise<void> {
  await client.db.execute(sql`
    insert into generations (
      id, project_id, capability, provider, model, prompt, status, output_asset_ids, completed_at
    )
    select
      gen_random_uuid(),
      ${projectId}::uuid,
      'image.generate',
      'anthropic',
      'claude-image',
      'filler',
      'complete',
      array[gen_random_uuid()],
      now()
    from generate_series(1, ${count})
  `);
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

    it('plans the origin filter as an index scan on generations_output_assets_idx, not a sequential scan of every generation', async () => {
      const project = await seedProject('Deep Fathom');
      const target = await assets.upload(project.id, {
        kind: 'image',
        filename: 'target.png',
        mimeType: 'image/png',
        content: Buffer.from('t'),
      });
      await recordGeneration(project.id, [target.id], '2026-01-01T00:00:00.000Z');

      // Enough unrelated rows in `generations` for the planner's row-count
      // estimates to actually prefer an index — the same order of magnitude
      // the reviewer reproduced the seq-scan regression with.
      await seedFillerGenerations(project.id, 3000);
      await client.db.execute(sql`analyze generations`);

      // Hand-written rather than built from `buildLibraryWhere`: extracting
      // that query's own bound params for a second, separate execution trips
      // a drizzle quirk where a param ends up holding a live column object
      // instead of a plain value (harmless for normal execution, fatal for
      // reserializing it here). This mirrors the same operator and the same
      // correlation `isGenerated` uses, so it still catches a regression back
      // to the non-indexable `= any(...)` form or to the wrong index.
      const explained = await client.pool.query(
        `explain (format text)
         select id from assets
         where project_id = $1
           and status = 'active'
           and exists (
             select 1 from generations
             where generations.project_id = assets.project_id
               and generations.output_asset_ids @> array[assets.id]::uuid[]
           )`,
        [project.id],
      );
      const plan = explained.rows.map((row) => row['QUERY PLAN'] as string).join('\n');

      expect(plan).not.toContain('Seq Scan on generations');
      expect(plan).toContain('generations_output_assets_idx');
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
});
