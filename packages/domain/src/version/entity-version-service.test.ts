import { beforeEach, describe, expect, it } from 'vitest';

import { ActivityService } from '../activity/activity-service';
import { EntityService } from '../entity/entity-service';
import { createProject, type Project } from '../project/project';
import { fixedClock } from '../shared/clock';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  InMemoryActivityRepository,
  InMemoryEntityRepository,
  InMemoryEntityVersionRepository,
  InMemoryProjectRepository,
} from '../testing';
import { EntityVersionService } from './entity-version-service';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let entities: EntityService;
let versions: EntityVersionService;
let versionRepo: InMemoryEntityVersionRepository;
let activityRepo: InMemoryActivityRepository;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projectRepo = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  versionRepo = new InMemoryEntityVersionRepository();
  activityRepo = new InMemoryActivityRepository();
  const activity = new ActivityService(activityRepo, deps);

  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  versions = new EntityVersionService(versionRepo, entityRepo, activity, deps);

  project = await projectRepo.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project-a') }),
  );
  otherProject = await projectRepo.insert(
    createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
  );
});

async function character(name = 'Kael') {
  return entities.create(project.id, { type: 'character', name, data: { morale: 1 } });
}

describe('committing versions', () => {
  it('records the entity current content and makes it current', async () => {
    const kael = await character();

    const version = await versions.commit(project.id, kael.id, { reason: 'milestone' });

    expect(version).toMatchObject({
      entityId: kael.id,
      versionNumber: 1,
      parentVersionId: null,
      branchName: 'main',
      reason: 'milestone',
      snapshot: { name: 'Kael', data: { morale: 1 } },
    });
    await expect(entities.getById(project.id, kael.id)).resolves.toMatchObject({
      currentVersionId: version.id,
    });
  });

  it('chains each version to the one that was current', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    await entities.update(project.id, kael.id, { name: 'Kael Vex' });
    const second = await versions.commit(project.id, kael.id);

    expect(second).toMatchObject({ versionNumber: 2, parentVersionId: first.id });
    expect(second.snapshot.name).toBe('Kael Vex');
  });

  it('does not write a version for an ordinary edit', async () => {
    const kael = await character();
    await versions.commit(project.id, kael.id);

    await entities.update(project.id, kael.id, { name: 'A' });
    await entities.update(project.id, kael.id, { name: 'B' });
    await entities.update(project.id, kael.id, { name: 'C' });

    // Autosave and undo are a separate concern; history stays meaningful.
    await expect(versions.list(project.id, kael.id)).resolves.toMatchObject({ total: 1 });
  });

  it('records who asked for the version and why', async () => {
    const kael = await character();

    const version = await versions.commit(project.id, kael.id, {
      reason: 'ai_edit',
      createdBy: 'user-7',
      metadata: { generationId: 'gen-1' },
    });

    expect(version).toMatchObject({
      reason: 'ai_edit',
      createdBy: 'user-7',
      metadata: { generationId: 'gen-1' },
    });
  });

  it('records an entity_version_created activity, but never for an ordinary edit', async () => {
    const kael = await character();

    const version = await versions.commit(project.id, kael.id, { reason: 'milestone' });
    await entities.update(project.id, kael.id, { name: 'Kael Vex' }); // no version, no activity

    const feed = await activityRepo.listByProject(project.id, {});
    const versionActivity = feed.items.filter((item) => item.type === 'entity_version_created');

    expect(versionActivity).toHaveLength(1);
    expect(versionActivity[0]).toMatchObject({
      summary: 'Kael — v1 saved',
      subjectType: 'entity_version',
      subjectId: version.id,
      metadata: { entityId: kael.id, versionNumber: 1, reason: 'milestone' },
    });
  });

  it('refuses to version an archived entity', async () => {
    const kael = await character();
    await entities.archive(project.id, kael.id);

    await expect(versions.commit(project.id, kael.id)).rejects.toThrow(ConflictError);
  });

  it('refuses to version through another project', async () => {
    const kael = await character();

    await expect(versions.commit(otherProject.id, kael.id)).rejects.toThrow(NotFoundError);
  });
});

describe('inspecting history', () => {
  it('returns everything a branch graph needs in one call', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    await entities.update(project.id, kael.id, { name: 'Kael Vex' });
    const second = await versions.commit(project.id, kael.id);
    const sketch = await versions.branch(project.id, first.id, { branchName: 'sketch' });

    const history = await versions.history(project.id, kael.id);

    expect(history.currentVersionId).toBe(sketch.id);
    expect(history.branches).toEqual(['main', 'sketch']);
    expect(history.total).toBe(3);
    expect(
      history.versions.map((version) => [
        version.versionNumber,
        version.branchName,
        version.parentVersionId,
      ]),
    ).toEqual([
      [3, 'sketch', first.id],
      [2, 'main', first.id],
      [1, 'main', null],
    ]);
    expect(second.branchName).toBe('main');
  });

  it('filters history by branch', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    await versions.branch(project.id, first.id, { branchName: 'sketch' });

    await expect(
      versions.list(project.id, kael.id, { branchName: 'sketch' }),
    ).resolves.toMatchObject({ total: 1 });
  });

  it('reads history for an archived entity', async () => {
    const kael = await character();
    await versions.commit(project.id, kael.id);
    await entities.archive(project.id, kael.id);

    await expect(versions.history(project.id, kael.id)).resolves.toMatchObject({ total: 1 });
  });
});

describe('comparing versions', () => {
  it('reports field-level changes, including inside type-specific data', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    await entities.update(project.id, kael.id, {
      name: 'Kael Vex',
      tags: ['Protagonist'],
      data: { morale: 4, homeworld: 'Thess' },
    });
    const second = await versions.commit(project.id, kael.id);

    const comparison = await versions.compare(project.id, first.id, second.id);

    expect(comparison.changes).toEqual([
      { field: 'name', from: 'Kael', to: 'Kael Vex' },
      { field: 'tags', from: [], to: ['Protagonist'] },
      { field: 'data.homeworld', from: undefined, to: 'Thess' },
      { field: 'data.morale', from: 1, to: 4 },
    ]);
  });

  it('reports no changes between identical snapshots', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    const second = await versions.commit(project.id, kael.id);

    await expect(versions.compare(project.id, first.id, second.id)).resolves.toMatchObject({
      changes: [],
    });
  });

  it('refuses to compare versions of different entities', async () => {
    const [kael, riven] = [await character('Kael'), await character('Riven')];
    const a = await versions.commit(project.id, kael.id);
    const b = await versions.commit(project.id, riven.id);

    await expect(versions.compare(project.id, a.id, b.id)).rejects.toThrow(ValidationError);
  });
});

describe('restoring', () => {
  it('brings back old content as a new version without deleting later history', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    await entities.update(project.id, kael.id, { name: 'Kael Vex', data: { morale: 9 } });
    const second = await versions.commit(project.id, kael.id);

    const restored = await versions.restoreVersion(project.id, first.id);

    expect(restored).toMatchObject({
      versionNumber: 3,
      parentVersionId: second.id,
      reason: 'restore',
      metadata: { restoredFromVersionId: first.id },
    });
    await expect(entities.getById(project.id, kael.id)).resolves.toMatchObject({
      name: 'Kael',
      data: { morale: 1 },
      currentVersionId: restored.id,
    });
    // Nothing was removed.
    await expect(versions.list(project.id, kael.id)).resolves.toMatchObject({ total: 3 });
    await expect(versions.getById(project.id, second.id)).resolves.toMatchObject({
      snapshot: { name: 'Kael Vex' },
    });
  });

  it('records an entity_version_restored activity naming the version restored to', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    await entities.update(project.id, kael.id, { name: 'Kael Vex' });
    await versions.commit(project.id, kael.id);

    const restored = await versions.restoreVersion(project.id, first.id);

    const feed = await activityRepo.listByProject(project.id, {});
    const restoreActivity = feed.items.find((item) => item.type === 'entity_version_restored');

    expect(restoreActivity).toMatchObject({
      summary: 'Kael restored to v1',
      subjectType: 'entity_version',
      subjectId: restored.id,
    });
  });

  it('leaves the historical version itself untouched', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    await entities.update(project.id, kael.id, { name: 'Kael Vex' });
    await versions.commit(project.id, kael.id);

    await versions.restoreVersion(project.id, first.id);
    await entities.update(project.id, kael.id, { name: 'Changed again' });

    await expect(versions.getById(project.id, first.id)).resolves.toMatchObject({
      id: first.id,
      versionNumber: 1,
      snapshot: { name: 'Kael', data: { morale: 1 } },
    });
  });

  it('can be undone by restoring the version it replaced', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    await entities.update(project.id, kael.id, { name: 'Kael Vex' });
    const second = await versions.commit(project.id, kael.id);

    await versions.restoreVersion(project.id, first.id);
    await versions.restoreVersion(project.id, second.id);

    await expect(entities.getById(project.id, kael.id)).resolves.toMatchObject({
      name: 'Kael Vex',
    });
  });
});

describe('branching', () => {
  it('starts an independent line of work from an earlier version', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    await entities.update(project.id, kael.id, { name: 'Kael Vex' });
    const mainTip = await versions.commit(project.id, kael.id);

    const branched = await versions.branch(project.id, first.id, { branchName: 'sketch' });
    await entities.update(project.id, kael.id, { name: 'Kael the Drifter' });
    const sketchTip = await versions.commit(project.id, kael.id);

    expect(branched).toMatchObject({ branchName: 'sketch', parentVersionId: first.id });
    // Commits after branching continue on the branch.
    expect(sketchTip.branchName).toBe('sketch');
    // The original line is untouched.
    await expect(versions.getById(project.id, mainTip.id)).resolves.toMatchObject({
      branchName: 'main',
      snapshot: { name: 'Kael Vex' },
    });
  });

  it('rejects a branch name that already exists on the entity', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    await versions.branch(project.id, first.id, { branchName: 'sketch' });

    await expect(versions.branch(project.id, first.id, { branchName: 'sketch' })).rejects.toThrow(
      ConflictError,
    );
  });

  it('rejects branching onto the source branch name', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);

    await expect(versions.branch(project.id, first.id, { branchName: 'main' })).rejects.toThrow(
      ValidationError,
    );
  });
});

describe('promoting', () => {
  it('brings branch work onto main without discarding either line', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    await entities.update(project.id, kael.id, { name: 'Kael Vex' });
    const mainTip = await versions.commit(project.id, kael.id);

    await versions.branch(project.id, first.id, { branchName: 'sketch' });
    await entities.update(project.id, kael.id, { name: 'Kael the Drifter' });
    const sketchTip = await versions.commit(project.id, kael.id);

    const promoted = await versions.promote(project.id, sketchTip.id);

    expect(promoted).toMatchObject({
      branchName: 'main',
      parentVersionId: mainTip.id,
      reason: 'promotion',
      metadata: { promotedFromVersionId: sketchTip.id },
      snapshot: { name: 'Kael the Drifter' },
    });
    await expect(entities.getById(project.id, kael.id)).resolves.toMatchObject({
      name: 'Kael the Drifter',
      currentVersionId: promoted.id,
    });
    await expect(versions.getById(project.id, sketchTip.id)).resolves.toMatchObject({
      branchName: 'sketch',
    });
  });

  it('rejects promoting onto the branch the version is already on', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);

    await expect(versions.promote(project.id, first.id, { branchName: 'main' })).rejects.toThrow(
      ValidationError,
    );
  });
});

describe('immutability', () => {
  it('never rewrites a version row through any operation', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    const before = structuredClone(await versions.getById(project.id, first.id));

    await entities.update(project.id, kael.id, { name: 'Kael Vex', data: { morale: 9 } });
    await versions.commit(project.id, kael.id);
    await versions.restoreVersion(project.id, first.id);
    await versions.branch(project.id, first.id, { branchName: 'sketch' });
    await versions.promote(project.id, first.id, { branchName: 'sketch' });

    expect(await versions.getById(project.id, first.id)).toEqual(before);
  });

  it('does not let a caller mutate stored history through a returned object', async () => {
    const kael = await character();
    const version = await versions.commit(project.id, kael.id);

    version.snapshot.name = 'tampered';
    version.snapshot.data.morale = 999;

    await expect(versions.getById(project.id, version.id)).resolves.toMatchObject({
      snapshot: { name: 'Kael', data: { morale: 1 } },
    });
  });

  it('keeps version numbers monotonic across branches and restores', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    await versions.branch(project.id, first.id, { branchName: 'sketch' });
    await versions.restoreVersion(project.id, first.id);
    await versions.commit(project.id, kael.id);

    const history = await versions.history(project.id, kael.id);
    expect(history.versions.map((version) => version.versionNumber)).toEqual([4, 3, 2, 1]);
  });
});
