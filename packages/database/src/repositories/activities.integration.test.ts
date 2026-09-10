import {
  ActivityService,
  ProjectService,
  systemClock,
  uuidIdGenerator,
  type Project,
} from '@level-zero/domain';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DatabaseClient } from '../postgres/client';
import { connectTestDatabase, truncateDomainTables } from '../testing/test-database';
import { DrizzleActivityRepository } from './activity-repository';
import { DrizzleProjectRepository } from './project-repository';

const deps = { clock: systemClock, ids: uuidIdGenerator };

let client: DatabaseClient;
let activityRepo: DrizzleActivityRepository;
let projects: ProjectService;
let activity: ActivityService;
let project: Project;
let otherProject: Project;

beforeAll(async () => {
  client = await connectTestDatabase();
  const projectRepo = new DrizzleProjectRepository(client.db);
  activityRepo = new DrizzleActivityRepository(client.db);

  projects = new ProjectService(projectRepo, deps);
  activity = new ActivityService(activityRepo, deps);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await truncateDomainTables(client);
  project = await projects.create({ name: 'Deep Fathom' });
  otherProject = await projects.create({ name: 'Sky Wreck' });
});

describe('round trips', () => {
  it('stores and reads back every field, including compact metadata', async () => {
    const recorded = await activity.record({
      projectId: project.id,
      type: 'entity_created',
      summary: 'Kael created',
      subjectType: 'entity',
      subjectId: uuidIdGenerator.next(),
      metadata: { entityType: 'character', name: 'Kael' },
      actor: 'user-7',
    });

    const feed = await activity.listByProject(project.id, {});

    expect(feed.items[0]).toMatchObject({
      id: recorded.id,
      type: 'entity_created',
      summary: 'Kael created',
      subjectType: 'entity',
      metadata: { entityType: 'character', name: 'Kael' },
      actor: 'user-7',
    });
    expect(feed.items[0]?.createdAt).toBeInstanceOf(Date);
  });

  it('renders a durable entry for a subject that no longer exists anywhere', async () => {
    // No entity, generation or prototype version was ever created for this
    // id — `subject_id` deliberately carries no foreign key, so a row about
    // a gone subject is exactly as readable as one about a live subject.
    const missingSubjectId = uuidIdGenerator.next();

    await activity.record({
      projectId: project.id,
      type: 'entity_archived',
      summary: 'Kael archived',
      subjectType: 'entity',
      subjectId: missingSubjectId,
    });

    const feed = await activity.listByProject(project.id, {});

    expect(feed.items[0]).toMatchObject({ summary: 'Kael archived', subjectId: missingSubjectId });
  });
});

describe('scoping and ordering', () => {
  it('never returns another project activity', async () => {
    await activity.record({
      projectId: project.id,
      type: 'entity_created',
      summary: 'Deep Fathom entity created',
      subjectType: 'entity',
      subjectId: uuidIdGenerator.next(),
    });
    await activity.record({
      projectId: otherProject.id,
      type: 'entity_created',
      summary: 'Sky Wreck entity created',
      subjectType: 'entity',
      subjectId: uuidIdGenerator.next(),
    });

    const feed = await activity.listByProject(project.id, {});

    expect(feed.total).toBe(1);
    expect(feed.items[0]?.summary).toBe('Deep Fathom entity created');
  });

  it('orders the feed newest first', async () => {
    const first = await activity.record({
      projectId: project.id,
      type: 'entity_created',
      summary: 'First',
      subjectType: 'entity',
      subjectId: uuidIdGenerator.next(),
    });
    const second = await activity.record({
      projectId: project.id,
      type: 'entity_created',
      summary: 'Second',
      subjectType: 'entity',
      subjectId: uuidIdGenerator.next(),
    });

    const feed = await activity.listByProject(project.id, {});

    expect(feed.items.map((item) => item.id)).toEqual([second.id, first.id]);
  });

  it('filters by type and by subject', async () => {
    const subjectId = uuidIdGenerator.next();
    await activity.record({
      projectId: project.id,
      type: 'entity_created',
      summary: 'Kael created',
      subjectType: 'entity',
      subjectId,
    });
    await activity.record({
      projectId: project.id,
      type: 'entity_archived',
      summary: 'Kael archived',
      subjectType: 'entity',
      subjectId,
    });
    await activity.record({
      projectId: project.id,
      type: 'entity_created',
      summary: 'Riven created',
      subjectType: 'entity',
      subjectId: uuidIdGenerator.next(),
    });

    await expect(
      activity.listByProject(project.id, { types: ['entity_archived'] }),
    ).resolves.toMatchObject({ total: 1, items: [{ summary: 'Kael archived' }] });

    await expect(activity.listByProject(project.id, { subjectId })).resolves.toMatchObject({
      total: 2,
    });
  });
});

describe('cleanup', () => {
  it('is removed when its project is deleted', async () => {
    await activity.record({
      projectId: project.id,
      type: 'entity_created',
      summary: 'Kael created',
      subjectType: 'entity',
      subjectId: uuidIdGenerator.next(),
    });

    await client.db.execute(sql`delete from projects where id = ${project.id}`);

    const remaining = await client.db.execute<{ count: number }>(
      sql`select count(*)::int as count from activities`,
    );
    expect(Number(remaining.rows[0]?.count)).toBe(0);
  });
});
