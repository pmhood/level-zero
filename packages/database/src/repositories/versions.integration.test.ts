import {
  ActivityService,
  ConflictError,
  EntityService,
  EntityVersionService,
  NotFoundError,
  ProjectService,
  createProject,
  systemClock,
  uuidIdGenerator,
  type Entity,
  type Project,
} from '@level-zero/domain';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DatabaseClient } from '../postgres/client';
import { connectTestDatabase, truncateDomainTables } from '../testing/test-database';
import { DrizzleActivityRepository } from './activity-repository';
import { DrizzleEntityRepository } from './entity-repository';
import { DrizzleEntityVersionRepository } from './entity-version-repository';
import { DrizzleProjectRepository } from './project-repository';

const deps = { clock: systemClock, ids: uuidIdGenerator };

let client: DatabaseClient;
let entities: EntityService;
let versions: EntityVersionService;
let versionRepo: DrizzleEntityVersionRepository;
let project: Project;
let otherProject: Project;

beforeAll(async () => {
  client = await connectTestDatabase();
  const projectRepo = new DrizzleProjectRepository(client.db);
  const entityRepo = new DrizzleEntityRepository(client.db);
  versionRepo = new DrizzleEntityVersionRepository(client.db);
  const activity = new ActivityService(new DrizzleActivityRepository(client.db), deps);

  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  versions = new EntityVersionService(versionRepo, entityRepo, activity, deps);
  void new ProjectService(projectRepo, deps);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await truncateDomainTables(client);
  const projectRepo = new DrizzleProjectRepository(client.db);
  project = await projectRepo.insert(createProject({ name: 'Deep Fathom' }, deps));
  otherProject = await projectRepo.insert(createProject({ name: 'Sky Wreck' }, deps));
});

function character(name = 'Kael'): Promise<Entity> {
  return entities.create(project.id, { type: 'character', name, data: { morale: 1 } });
}

describe('version round trips', () => {
  it('stores the snapshot faithfully, including nested data', async () => {
    const kael = await entities.create(project.id, {
      type: 'character',
      name: 'Kael',
      description: 'A reluctant pilot',
      tags: ['Protagonist'],
      data: { morale: 3, loadout: ['wrench'], homeworld: { name: 'Thess', gravity: 0.8 } },
    });

    const version = await versions.commit(project.id, kael.id, { createdBy: 'user-7' });
    const reread = await versions.getById(project.id, version.id);

    expect(reread.snapshot).toEqual({
      name: 'Kael',
      description: 'A reluctant pilot',
      status: 'draft',
      tags: ['Protagonist'],
      data: { morale: 3, loadout: ['wrench'], homeworld: { name: 'Thess', gravity: 0.8 } },
    });
    expect(reread.createdBy).toBe('user-7');
    expect(reread.createdAt).toBeInstanceOf(Date);
  });

  it('points the entity at its current version', async () => {
    const kael = await character();
    const version = await versions.commit(project.id, kael.id);

    await expect(entities.getById(project.id, kael.id)).resolves.toMatchObject({
      currentVersionId: version.id,
    });
  });

  it('never reads a version through the wrong project', async () => {
    const kael = await character();
    const version = await versions.commit(project.id, kael.id);

    await expect(versions.getById(otherProject.id, version.id)).rejects.toThrow(NotFoundError);
  });
});

describe('branching and restoring over Postgres', () => {
  it('keeps both lines of work after a branch', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    await entities.update(project.id, kael.id, { name: 'Kael Vex' });
    const mainTip = await versions.commit(project.id, kael.id);

    await versions.branch(project.id, first.id, { branchName: 'sketch' });
    await entities.update(project.id, kael.id, { name: 'Kael the Drifter' });
    const sketchTip = await versions.commit(project.id, kael.id);

    const history = await versions.history(project.id, kael.id);
    expect(history.branches).toEqual(['main', 'sketch']);
    expect(history.currentVersionId).toBe(sketchTip.id);
    await expect(versions.getById(project.id, mainTip.id)).resolves.toMatchObject({
      snapshot: { name: 'Kael Vex' },
    });
  });

  it('restores without deleting later history', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    await entities.update(project.id, kael.id, { name: 'Kael Vex', data: { morale: 9 } });
    const second = await versions.commit(project.id, kael.id);

    const restored = await versions.restoreVersion(project.id, first.id);

    expect(restored.parentVersionId).toBe(second.id);
    await expect(entities.getById(project.id, kael.id)).resolves.toMatchObject({
      name: 'Kael',
      data: { morale: 1 },
    });
    await expect(versions.list(project.id, kael.id)).resolves.toMatchObject({ total: 3 });
  });

  it('promotes branch work onto main', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    await versions.branch(project.id, first.id, { branchName: 'sketch' });
    await entities.update(project.id, kael.id, { name: 'Kael the Drifter' });
    const sketchTip = await versions.commit(project.id, kael.id);

    const promoted = await versions.promote(project.id, sketchTip.id);

    expect(promoted.branchName).toBe('main');
    await expect(entities.getById(project.id, kael.id)).resolves.toMatchObject({
      name: 'Kael the Drifter',
      currentVersionId: promoted.id,
    });
  });

  it('compares two versions field by field', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    await entities.update(project.id, kael.id, { name: 'Kael Vex', data: { morale: 4 } });
    const second = await versions.commit(project.id, kael.id);

    const comparison = await versions.compare(project.id, first.id, second.id);

    expect(comparison.changes).toEqual([
      { field: 'name', from: 'Kael', to: 'Kael Vex' },
      { field: 'data.morale', from: 1, to: 4 },
    ]);
  });
});

describe('history is protected by the database', () => {
  it('refuses to delete a version another version descends from', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);
    await versions.commit(project.id, kael.id);

    await expectPostgresError(
      client.db.execute(sql`delete from entity_versions where id = ${first.id}`),
      '23503',
    );
  });

  it('refuses to delete an entity that has history', async () => {
    const kael = await character();
    await versions.commit(project.id, kael.id);

    await expectPostgresError(
      client.db.execute(sql`delete from entities where id = ${kael.id}`),
      '23503',
    );
  });

  it('rejects a duplicate version number for one entity', async () => {
    const kael = await character();
    const first = await versions.commit(project.id, kael.id);

    await expect(versionRepo.insert({ ...first, id: uuidIdGenerator.next() })).rejects.toThrow(
      ConflictError,
    );
  });

  it('still allows a whole project to be removed', async () => {
    const kael = await character();
    await versions.commit(project.id, kael.id);
    await entities.update(project.id, kael.id, { name: 'Kael Vex' });
    await versions.commit(project.id, kael.id);

    await client.db.execute(sql`delete from projects where id = ${project.id}`);

    const remaining = await client.db.execute<{ count: number }>(
      sql`select count(*)::int as count from entity_versions`,
    );
    expect(Number(remaining.rows[0]?.count)).toBe(0);
  });
});

/** Drizzle wraps driver errors, so the SQLSTATE lives on the cause chain. */
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
