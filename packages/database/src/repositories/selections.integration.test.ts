import {
  ActivityService,
  AssetSelectionService,
  AssetService,
  EntityService,
  ProjectService,
  ReviewTargetResolver,
  currentAssetSelections,
  fixedClock,
  systemClock,
  uuidIdGenerator,
  type Asset,
  type Entity,
  type Project,
} from '@level-zero/domain';
import { InMemoryObjectStorageProvider } from '@level-zero/domain/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DatabaseClient } from '../postgres/client';
import { connectTestDatabase, truncateDomainTables } from '../testing/test-database';
import { DrizzleActivityRepository } from './activity-repository';
import { DrizzleAssetMarkRepository } from './asset-mark-repository';
import { DrizzleAssetRepository } from './asset-repository';
import { DrizzleAssetSelectionRepository } from './asset-selection-repository';
import { DrizzleEntityRepository } from './entity-repository';
import { DrizzleEntityVersionRepository } from './entity-version-repository';
import { DrizzleProjectRepository } from './project-repository';
import { DrizzlePrototypeVersionRepository } from './prototype-version-repository';

const deps = { clock: systemClock, ids: uuidIdGenerator };

let client: DatabaseClient;
let projects: ProjectService;
let entities: EntityService;
let assets: AssetService;
let selections: AssetSelectionService;
let selectionsAt: (instant: string) => AssetSelectionService;

let project: Project;
let otherProject: Project;
let diver: Entity;
let concepts: Asset[];

const portrait = () => ({ entityId: diver.id, purpose: 'portrait' });
const costume = () => ({ entityId: diver.id, purpose: 'costume' });

beforeAll(async () => {
  client = await connectTestDatabase();

  const projectRepo = new DrizzleProjectRepository(client.db);
  const entityRepo = new DrizzleEntityRepository(client.db);
  const assetRepo = new DrizzleAssetRepository(client.db);
  const activity = new ActivityService(new DrizzleActivityRepository(client.db), deps);

  projects = new ProjectService(projectRepo, deps);
  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  assets = new AssetService(assetRepo, projectRepo, new InMemoryObjectStorageProvider(), deps);

  const targets = new ReviewTargetResolver(
    entityRepo,
    assetRepo,
    new DrizzlePrototypeVersionRepository(client.db),
    new DrizzleEntityVersionRepository(client.db),
  );
  const selectionRepo = new DrizzleAssetSelectionRepository(client.db);
  const markRepo = new DrizzleAssetMarkRepository(client.db);
  selections = new AssetSelectionService(selectionRepo, markRepo, targets, deps);

  // The same service deciding at a stated instant. Timestamps come from the app
  // clock at millisecond resolution, so two decisions written in the same
  // millisecond would order by their random uuid — fine in the product, not
  // fine in a test that asserts which came first.
  selectionsAt = (instant: string) =>
    new AssetSelectionService(selectionRepo, markRepo, targets, {
      clock: fixedClock(instant),
      ids: uuidIdGenerator,
    });
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await truncateDomainTables(client);
  project = await projects.create({ name: 'Deep Fathom' });
  otherProject = await projects.create({ name: 'Sky Wreck' });

  diver = await entities.create(project.id, { type: 'character', name: 'The Diver' });
  concepts = [];
  for (const filename of ['diver-a.png', 'diver-b.png', 'diver-c.png']) {
    concepts.push(
      await assets.upload(project.id, {
        kind: 'image',
        filename,
        mimeType: 'image/png',
        content: Buffer.from(`pretend ${filename} bytes`),
      }),
    );
  }
});

describe('asset marks', () => {
  it('round-trips a favourite and a shortlist on the same asset', async () => {
    await selections.mark(project.id, {
      assetId: concepts[0]!.id,
      kind: 'favorite',
      actor: 'ada',
    });
    await selections.mark(project.id, {
      assetId: concepts[0]!.id,
      kind: 'shortlisted',
      actor: 'ada',
    });

    const marks = await selections.listMarks(project.id);
    expect(marks.map((mark) => mark.kind).sort()).toEqual(['favorite', 'shortlisted']);
    expect(marks.every((mark) => mark.assetId === concepts[0]!.id)).toBe(true);
  });

  it('leaves one row when the same mark is added twice', async () => {
    const first = await selections.mark(project.id, {
      assetId: concepts[0]!.id,
      kind: 'favorite',
      actor: 'ada',
    });
    const again = await selections.mark(project.id, {
      assetId: concepts[0]!.id,
      kind: 'favorite',
      actor: 'brun',
    });

    expect(again.id).toBe(first.id);
    expect(again.actor).toBe('ada');
    expect(await selections.listMarks(project.id)).toHaveLength(1);
  });

  it('removes a mark, and says so when there was nothing to remove', async () => {
    await selections.mark(project.id, {
      assetId: concepts[0]!.id,
      kind: 'favorite',
      actor: 'ada',
    });

    await expect(selections.unmark(project.id, concepts[0]!.id, 'favorite')).resolves.toBe(true);
    await expect(selections.unmark(project.id, concepts[0]!.id, 'favorite')).resolves.toBe(false);
  });

  it('refuses to keep a mark on an asset somebody deletes', async () => {
    await selections.mark(project.id, {
      assetId: concepts[0]!.id,
      kind: 'favorite',
      actor: 'ada',
    });

    await expect(
      client.db.execute(sql`delete from assets where id = ${concepts[0]!.id}`),
    ).rejects.toThrow();
  });
});

describe('asset selections', () => {
  it('round-trips an approval with its actor, note and purpose', async () => {
    const { approval } = await selections.approve(project.id, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'ada',
      note: 'Reads at thumbnail size.',
    });

    const summary = await selections.getSummary(project.id, portrait());
    expect(summary.current).toHaveLength(1);
    expect(summary.current[0]).toMatchObject({
      id: approval.id,
      assetId: concepts[0]!.id,
      context: { entityId: diver.id, purpose: 'portrait' },
      state: 'approved',
      actor: 'ada',
      note: 'Reads at thumbnail size.',
      supersededBySelectionId: null,
    });
  });

  it('keeps two purposes for the same entity apart', async () => {
    await selections.approve(project.id, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'ada',
    });
    await selections.approve(project.id, {
      assetId: concepts[1]!.id,
      context: costume(),
      actor: 'ada',
    });

    const asPortrait = await selections.getSummary(project.id, portrait());
    const asCostume = await selections.getSummary(project.id, costume());
    expect(asPortrait.current.map((selection) => selection.assetId)).toEqual([concepts[0]!.id]);
    expect(asCostume.current.map((selection) => selection.assetId)).toEqual([concepts[1]!.id]);
  });

  it('reads a history newest first', async () => {
    await selectionsAt('2026-03-01T09:00:00.000Z').reject(project.id, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'ada',
    });
    await selectionsAt('2026-03-02T09:00:00.000Z').approve(project.id, {
      assetId: concepts[1]!.id,
      context: portrait(),
      actor: 'ada',
    });

    const summary = await selections.getSummary(project.id, portrait());
    expect(summary.history.map((selection) => selection.state)).toEqual(['approved', 'rejected']);
  });

  it('points a superseded row at the approval that replaced it', async () => {
    await selectionsAt('2026-03-01T09:00:00.000Z').approve(project.id, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'ada',
    });
    const second = await selectionsAt('2026-03-02T09:00:00.000Z').approve(project.id, {
      assetId: concepts[1]!.id,
      context: portrait(),
      actor: 'brun',
      supersedes: [concepts[0]!.id],
    });

    const forOldConcept = await selections.listForAsset(project.id, concepts[0]!.id);
    expect(forOldConcept.map((selection) => selection.state)).toEqual(['superseded', 'approved']);
    expect(forOldConcept[0]!.supersededBySelectionId).toBe(second.approval.id);
    expect(
      currentAssetSelections((await selections.getSummary(project.id, portrait())).history).map(
        (selection) => selection.assetId,
      ),
    ).toEqual([concepts[1]!.id]);
  });

  it('refuses a supersession that names no replacement', async () => {
    const { approval } = await selections.approve(project.id, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'ada',
    });

    await expect(
      client.db.execute(
        sql`update asset_selections set state = 'superseded' where id = ${approval.id}`,
      ),
    ).rejects.toThrow();
  });

  it('refuses a purpose that is only whitespace', async () => {
    const { approval } = await selections.approve(project.id, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'ada',
    });

    await expect(
      client.db.execute(sql`update asset_selections set purpose = '   ' where id = ${approval.id}`),
    ).rejects.toThrow();
  });

  it('refuses a selection whose context entity belongs to another project', async () => {
    const elsewhere = await entities.create(otherProject.id, {
      type: 'character',
      name: 'Someone else',
    });
    const { approval } = await selections.approve(project.id, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'ada',
    });

    await expect(
      client.db.execute(
        sql`update asset_selections set context_entity_id = ${elsewhere.id} where id = ${approval.id}`,
      ),
    ).rejects.toThrow();
  });

  it('keeps the entity a decision names alive', async () => {
    await selections.approve(project.id, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'ada',
    });

    await expect(
      client.db.execute(sql`delete from entities where id = ${diver.id}`),
    ).rejects.toThrow();
  });

  it('leaves the asset untouched by every decision about it', async () => {
    await selections.approve(project.id, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'ada',
    });
    await selections.reject(project.id, {
      assetId: concepts[0]!.id,
      context: costume(),
      actor: 'ada',
    });

    await expect(assets.getById(project.id, concepts[0]!.id)).resolves.toEqual(concepts[0]);
  });

  it('reads every purpose an entity currently stands behind in one go', async () => {
    await selectionsAt('2026-03-01T09:00:00.000Z').approve(project.id, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'ada',
    });
    await selectionsAt('2026-03-02T09:00:00.000Z').approve(project.id, {
      assetId: concepts[1]!.id,
      context: costume(),
      actor: 'ada',
    });

    const forDiver = await selections.listForEntity(project.id, diver.id);
    expect(forDiver.map((selection) => selection.context.purpose)).toEqual(['costume', 'portrait']);
  });

  it('keeps one project out of another project’s selections', async () => {
    await selections.approve(project.id, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'ada',
    });

    expect((await selections.getSummary(otherProject.id, portrait())).history).toEqual([]);
    expect(await selections.listForEntity(otherProject.id, diver.id)).toEqual([]);
    expect(await selections.listForAsset(otherProject.id, concepts[0]!.id)).toEqual([]);
  });

  it('clears its rows when the project goes, even though they restrict what they name', async () => {
    await selections.approve(project.id, {
      assetId: concepts[0]!.id,
      context: portrait(),
      actor: 'ada',
    });
    await selections.mark(project.id, {
      assetId: concepts[0]!.id,
      kind: 'favorite',
      actor: 'ada',
    });

    await client.db.execute(sql`delete from projects where id = ${project.id}`);

    const remaining = await client.db.execute<{ count: number }>(
      sql`select (select count(*) from asset_selections) + (select count(*) from asset_marks) as count`,
    );
    expect(Number(remaining.rows[0]?.count)).toBe(0);
  });
});
