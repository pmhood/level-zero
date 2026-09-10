import { beforeEach, describe, expect, it } from 'vitest';

import { ActivityService } from '../activity/activity-service';
import { EntityService } from '../entity/entity-service';
import { TUNING_PARAMETERS_KEY, type Parameter } from '../parameter/parameter';
import { createProject, type Project } from '../project/project';
import { fixedClock } from '../shared/clock';
import { ConflictError, NotFoundError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  InMemoryActivityRepository,
  InMemoryEntityRepository,
  InMemoryEntityVersionRepository,
  InMemoryProjectRepository,
} from '../testing';
import { EntityVersionService } from '../version/entity-version-service';
import { TUNING_GROUP, entityVersionDifferences } from './entity-differences';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let entities: EntityService;
let versions: EntityVersionService;
let project: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projectRepo = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const versionRepo = new InMemoryEntityVersionRepository();
  const activity = new ActivityService(new InMemoryActivityRepository(), deps);

  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  versions = new EntityVersionService(versionRepo, entityRepo, activity, deps);
  project = await projectRepo.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project') }),
  );
});

const drain = (value: number): Parameter => ({
  id: 'oxygen-drain',
  label: 'Oxygen drain',
  type: 'range',
  value,
  min: 0,
  max: 240,
  step: 1,
  units: 's',
});

async function mechanic() {
  return entities.create(project.id, {
    type: 'mechanic',
    name: 'Oxygen management',
    data: { [TUNING_PARAMETERS_KEY]: [drain(120)] },
  });
}

async function tune(entityId: string, value: number) {
  await entities.update(project.id, entityId, {
    data: { [TUNING_PARAMETERS_KEY]: [drain(value)] },
  });
}

/**
 * Compare is a *reading* of the history the version service already keeps, and
 * the actions it offers are that service's own. These tests hold the seam:
 * what a comparison says, and that acting on it appends rather than rewrites.
 */
describe('comparing and then acting on the result', () => {
  it('reads two tunings of the same mechanic as the values that moved', async () => {
    const oxygen = await mechanic();
    const first = await versions.commit(project.id, oxygen.id);
    await tune(oxygen.id, 90);
    const second = await versions.commit(project.id, oxygen.id);

    const comparison = await versions.compare(project.id, first.id, second.id);

    expect(entityVersionDifferences(comparison.from.snapshot, comparison.to.snapshot)).toEqual([
      {
        title: TUNING_GROUP,
        differences: [
          {
            key: 'oxygen-drain',
            label: 'Oxygen drain',
            change: 'changed',
            from: '120 s',
            to: '90 s',
          },
        ],
      },
    ]);
  });

  it('keeps every later version when the older side is chosen', async () => {
    const oxygen = await mechanic();
    const first = await versions.commit(project.id, oxygen.id);
    await tune(oxygen.id, 90);
    const second = await versions.commit(project.id, oxygen.id);
    await tune(oxygen.id, 60);
    const third = await versions.commit(project.id, oxygen.id);

    const restored = await versions.restoreVersion(project.id, first.id);

    const history = await versions.history(project.id, oxygen.id);
    expect(history.versions.map((version) => version.id)).toEqual([
      restored.id,
      third.id,
      second.id,
      first.id,
    ]);
    expect(history.currentVersionId).toBe(restored.id);
    expect(restored.parentVersionId).toBe(third.id);

    // The two versions the reader compared still say exactly what they said.
    const comparison = await versions.compare(project.id, first.id, third.id);
    expect(comparison.from.snapshot.data[TUNING_PARAMETERS_KEY]).toEqual([drain(120)]);
    expect(comparison.to.snapshot.data[TUNING_PARAMETERS_KEY]).toEqual([drain(60)]);
  });

  it('starts a new line of work rather than moving the version branched from', async () => {
    const oxygen = await mechanic();
    const first = await versions.commit(project.id, oxygen.id);
    await tune(oxygen.id, 90);
    const second = await versions.commit(project.id, oxygen.id);

    const branched = await versions.branch(project.id, first.id, { branchName: 'gentler' });

    expect(branched).toMatchObject({ branchName: 'gentler', parentVersionId: first.id });
    await expect(versions.getById(project.id, first.id)).resolves.toMatchObject({
      branchName: 'main',
      versionNumber: 1,
    });
    await expect(versions.list(project.id, oxygen.id)).resolves.toMatchObject({ total: 3 });
    // Comparing the branch tip against the line it left is the reason to branch.
    const comparison = await versions.compare(project.id, second.id, branched.id);
    expect(entityVersionDifferences(comparison.from.snapshot, comparison.to.snapshot)).toEqual([
      {
        title: TUNING_GROUP,
        differences: [
          {
            key: 'oxygen-drain',
            label: 'Oxygen drain',
            change: 'changed',
            from: '90 s',
            to: '120 s',
          },
        ],
      },
    ]);
  });

  it('still compares an archived entity but refuses to act on it', async () => {
    const oxygen = await mechanic();
    const first = await versions.commit(project.id, oxygen.id);
    await tune(oxygen.id, 90);
    const second = await versions.commit(project.id, oxygen.id);
    await entities.archive(project.id, oxygen.id);

    await expect(versions.compare(project.id, first.id, second.id)).resolves.toMatchObject({
      from: { id: first.id },
      to: { id: second.id },
    });
    await expect(versions.restoreVersion(project.id, first.id)).rejects.toThrow(ConflictError);
    await expect(versions.branch(project.id, first.id, { branchName: 'gentler' })).rejects.toThrow(
      ConflictError,
    );
  });

  it('reports a side that is not there rather than comparing against nothing', async () => {
    const oxygen = await mechanic();
    const first = await versions.commit(project.id, oxygen.id);

    await expect(versions.compare(project.id, first.id, 'ver_missing')).rejects.toThrow(
      NotFoundError,
    );
  });
});
