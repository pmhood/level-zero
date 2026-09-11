import {
  ActivityService,
  ConflictError,
  EntityService,
  PlaytestService,
  ProjectService,
  PrototypeService,
  systemClock,
  uuidIdGenerator,
  type Playtest,
  type Project,
} from '@level-zero/domain';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DatabaseClient } from '../postgres/client';
import { connectTestDatabase, truncateDomainTables } from '../testing/test-database';
import { DrizzleActivityRepository } from './activity-repository';
import { DrizzleAssetRepository } from './asset-repository';
import { DrizzleEntityRepository } from './entity-repository';
import { DrizzleEntityVersionRepository } from './entity-version-repository';
import { DrizzlePlaytestRepository } from './playtest-repository';
import { DrizzleProjectRepository } from './project-repository';
import { DrizzlePrototypeVersionRepository } from './prototype-version-repository';

const deps = { clock: systemClock, ids: uuidIdGenerator };

let client: DatabaseClient;
let playtestRepo: DrizzlePlaytestRepository;
let activityRepo: DrizzleActivityRepository;
let projects: ProjectService;
let entities: EntityService;
let prototypes: PrototypeService;
let playtests: PlaytestService;
let project: Project;
let otherProject: Project;

beforeAll(async () => {
  client = await connectTestDatabase();
  const projectRepo = new DrizzleProjectRepository(client.db);
  const entityRepo = new DrizzleEntityRepository(client.db);
  const entityVersionRepo = new DrizzleEntityVersionRepository(client.db);
  const assetRepo = new DrizzleAssetRepository(client.db);
  const prototypeVersionRepo = new DrizzlePrototypeVersionRepository(client.db);
  playtestRepo = new DrizzlePlaytestRepository(client.db);
  activityRepo = new DrizzleActivityRepository(client.db);

  const activity = new ActivityService(activityRepo, deps);

  projects = new ProjectService(projectRepo, deps);
  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  prototypes = new PrototypeService(
    prototypeVersionRepo,
    entities,
    entityVersionRepo,
    assetRepo,
    activity,
    deps,
  );
  playtests = new PlaytestService(playtestRepo, prototypeVersionRepo, entities, activity, deps);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await truncateDomainTables(client);
  project = await projects.create({ name: 'Deep Fathom' });
  otherProject = await projects.create({ name: 'Sky Wreck' });
});

/** A prototype with one captured version and an entity to observe, ready to be playtested. */
async function prototypedVersion(projectId = project.id) {
  const diver = await entities.create(projectId, { type: 'character', name: 'The Diver' });
  const { version } = await prototypes.create(projectId, {
    prototypeName: 'Vertical slice',
    members: [],
  });
  return { diver, version };
}

async function createPlaytest(projectId: string, prototypeVersionId: string): Promise<Playtest> {
  return playtests.create(projectId, {
    prototypeVersionId,
    name: 'First vertical slice test',
  });
}

describe('recording a playtest', () => {
  it('pins an exact prototype version and records sessions, observations, feedback and metrics under it', async () => {
    const { diver, version } = await prototypedVersion();
    const playtest = await createPlaytest(project.id, version.id);

    expect(playtest).toMatchObject({
      projectId: project.id,
      prototypeVersionId: version.id,
      status: 'planned',
    });
    // §5.3: no prototypeId anywhere on the record.
    expect(Object.keys(playtest)).not.toContain('prototypeId');

    const session = await playtests.recordSession(project.id, playtest.id, {
      participant: 'Alex',
    });
    const observation = await playtests.recordObservation(project.id, playtest.id, {
      sessionId: session.id,
      entityId: diver.id,
      atSeconds: 42,
      body: 'Got stuck at the trench',
      tags: ['bug'],
    });
    const feedback = await playtests.recordFeedback(project.id, playtest.id, {
      sessionId: session.id,
      body: 'Loved the pacing!',
      sentiment: 'positive',
    });
    const metric = await playtests.recordMetric(project.id, playtest.id, {
      sessionId: session.id,
      label: 'Session duration',
      value: 120,
      unit: 's',
    });

    await expect(playtests.listSessions(project.id, playtest.id)).resolves.toEqual([session]);
    await expect(playtests.listObservations(project.id, playtest.id)).resolves.toEqual([
      observation,
    ]);
    await expect(playtests.listFeedback(project.id, playtest.id)).resolves.toEqual([feedback]);
    await expect(playtests.listMetrics(project.id, playtest.id)).resolves.toEqual([metric]);
  });

  it('numbers sessions monotonically and rejects a racing duplicate number', async () => {
    const { version } = await prototypedVersion();
    const playtest = await createPlaytest(project.id, version.id);
    const first = await playtests.recordSession(project.id, playtest.id, {});

    await expect(
      playtestRepo.insertSession({ ...first, id: uuidIdGenerator.next() }),
    ).rejects.toThrow(ConflictError);
  });

  it('rejects a racing duplicate metric for the same run', async () => {
    const { version } = await prototypedVersion();
    const playtest = await createPlaytest(project.id, version.id);
    const metric = await playtests.recordMetric(project.id, playtest.id, {
      label: 'Completion rate',
      value: 1,
    });

    await expect(
      playtestRepo.insertMetric({ ...metric, id: uuidIdGenerator.next() }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('completing a playtest', () => {
  it('records a playtest_completed activity scoped to its own project', async () => {
    const { version } = await prototypedVersion();
    const playtest = await createPlaytest(project.id, version.id);
    const { version: otherVersion } = await prototypedVersion(otherProject.id);
    await createPlaytest(otherProject.id, otherVersion.id);

    const completed = await playtests.update(project.id, playtest.id, { status: 'complete' });

    const feed = await activityRepo.listByProject(project.id, {});
    const recorded = feed.items.find((item) => item.type === 'playtest_completed');
    expect(recorded).toMatchObject({
      projectId: project.id,
      summary: `${completed.name} completed`,
      subjectType: 'playtest',
      subjectId: completed.id,
      metadata: { prototypeVersionId: version.id },
    });

    const otherFeed = await activityRepo.listByProject(otherProject.id, {});
    expect(otherFeed.items.find((item) => item.type === 'playtest_completed')).toBeUndefined();
  });

  it('does not record a second activity when an already-complete playtest is updated again', async () => {
    const { version } = await prototypedVersion();
    const playtest = await createPlaytest(project.id, version.id);
    await playtests.update(project.id, playtest.id, { status: 'complete' });

    await playtests.update(project.id, playtest.id, { summary: 'Final write-up' });

    const feed = await activityRepo.listByProject(project.id, {});
    const recorded = feed.items.filter((item) => item.type === 'playtest_completed');
    expect(recorded).toHaveLength(1);
  });
});

describe('history is protected by the database', () => {
  it('cannot pin a version from another project, even bypassing the service', async () => {
    const { version } = await prototypedVersion();

    await expectPostgresError(
      client.db.execute(
        sql`insert into playtests (id, project_id, prototype_version_id, name, status, tags, created_at, updated_at)
            values (gen_random_uuid(), ${otherProject.id}, ${version.id}, 'Cross-project playtest', 'planned', '{}', now(), now())`,
      ),
      '23503',
    );
  });

  it('refuses to delete a prototype version a playtest cites', async () => {
    const { version } = await prototypedVersion();
    await createPlaytest(project.id, version.id);

    await expectPostgresError(
      client.db.execute(sql`delete from prototype_versions where id = ${version.id}`),
      '23503',
    );
  });

  it('refuses to delete an entity an observation points at', async () => {
    const { diver, version } = await prototypedVersion();
    const playtest = await createPlaytest(project.id, version.id);
    await playtests.recordObservation(project.id, playtest.id, {
      entityId: diver.id,
      body: 'Got stuck at the trench',
    });

    await expectPostgresError(
      client.db.execute(sql`delete from entities where id = ${diver.id}`),
      '23503',
    );
  });

  it('refuses to file a note under a session from another playtest', async () => {
    const { version } = await prototypedVersion();
    const playtest = await createPlaytest(project.id, version.id);
    const otherPlaytest = await createPlaytest(project.id, version.id);
    const foreignSession = await playtests.recordSession(project.id, otherPlaytest.id, {});

    await expectPostgresError(
      client.db.execute(
        sql`insert into playtest_observations
              (id, project_id, playtest_id, session_id, body, tags, created_at, updated_at)
            values (gen_random_uuid(), ${project.id}, ${playtest.id}, ${foreignSession.id}, 'note', '{}', now(), now())`,
      ),
      '23503',
    );
  });

  it('still allows a whole project to be removed', async () => {
    const { diver, version } = await prototypedVersion();
    const playtest = await createPlaytest(project.id, version.id);
    const session = await playtests.recordSession(project.id, playtest.id, {});
    await playtests.recordObservation(project.id, playtest.id, {
      sessionId: session.id,
      entityId: diver.id,
      body: 'Got stuck at the trench',
    });
    await playtests.recordFeedback(project.id, playtest.id, { body: 'Loved it' });
    await playtests.recordMetric(project.id, playtest.id, {
      sessionId: session.id,
      label: 'Session duration',
      value: 120,
    });

    await client.db.execute(sql`delete from projects where id = ${project.id}`);

    for (const table of [
      'playtests',
      'playtest_sessions',
      'playtest_observations',
      'playtest_feedback',
      'playtest_metrics',
    ]) {
      const remaining = await client.db.execute<{ count: number }>(
        sql.raw(`select count(*)::int as count from ${table}`),
      );
      expect(Number(remaining.rows[0]?.count), `${table} should be empty`).toBe(0);
    }
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
