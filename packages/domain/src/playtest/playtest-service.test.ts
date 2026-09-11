import { beforeEach, describe, expect, it } from 'vitest';

import { ActivityService } from '../activity/activity-service';
import { EntityService } from '../entity/entity-service';
import { createProject, type Project } from '../project/project';
import { createPrototypeVersion, type PrototypeVersion } from '../prototype/prototype-version';
import { fixedClock } from '../shared/clock';
import { NotFoundError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  InMemoryActivityRepository,
  InMemoryEntityRepository,
  InMemoryPlaytestRepository,
  InMemoryProjectRepository,
  InMemoryPrototypeVersionRepository,
} from '../testing';
import { PlaytestService } from './playtest-service';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const deps = { clock, ids: sequentialIdGenerator('id') };

let entities: EntityService;
let prototypeVersionRepo: InMemoryPrototypeVersionRepository;
let activityRepo: InMemoryActivityRepository;
let playtests: PlaytestService;
let project: Project;
let otherProject: Project;
let version: PrototypeVersion;

beforeEach(async () => {
  const projectRepo = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  activityRepo = new InMemoryActivityRepository();
  const activity = new ActivityService(activityRepo, deps);
  entities = new EntityService(entityRepo, projectRepo, activity, deps);

  prototypeVersionRepo = new InMemoryPrototypeVersionRepository();
  playtests = new PlaytestService(
    new InMemoryPlaytestRepository(),
    prototypeVersionRepo,
    entities,
    activity,
    deps,
  );

  project = await projectRepo.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project-a') }),
  );
  otherProject = await projectRepo.insert(
    createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
  );

  version = await prototypeVersionRepo.insert(
    createPrototypeVersion(
      { projectId: project.id, prototypeId: 'prototype-1', versionNumber: 1, members: [] },
      { clock, ids: sequentialIdGenerator('version') },
    ),
  );
});

describe('creating a playtest', () => {
  it('pins an exact prototype version', async () => {
    const playtest = await playtests.create(project.id, {
      prototypeVersionId: version.id,
      name: 'First vertical slice test',
    });

    expect(playtest).toMatchObject({
      projectId: project.id,
      prototypeVersionId: version.id,
      name: 'First vertical slice test',
      status: 'planned',
      tags: [],
    });
    expect(playtest).not.toHaveProperty('prototypeId');
  });

  it('rejects a version that does not exist in this project', async () => {
    await expect(
      playtests.create(otherProject.id, {
        prototypeVersionId: version.id,
        name: 'Cross-project playtest',
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('updating a playtest', () => {
  it('changes status and summary without touching the pin', async () => {
    const playtest = await playtests.create(project.id, {
      prototypeVersionId: version.id,
      name: 'Vertical slice',
    });

    const updated = await playtests.update(project.id, playtest.id, {
      status: 'complete',
      summary: 'Players finished in under ten minutes.',
    });

    expect(updated).toMatchObject({
      status: 'complete',
      summary: 'Players finished in under ten minutes.',
      prototypeVersionId: version.id,
    });
  });

  it('records a playtest_completed activity naming the playtest, scoped to its project', async () => {
    const playtest = await playtests.create(project.id, {
      prototypeVersionId: version.id,
      name: 'Vertical slice',
      createdBy: 'Alex',
    });

    const completed = await playtests.update(project.id, playtest.id, { status: 'complete' });

    const feed = await activityRepo.listByProject(project.id, {});
    expect(feed.items).toMatchObject([
      {
        projectId: project.id,
        type: 'playtest_completed',
        summary: 'Vertical slice completed',
        subjectType: 'playtest',
        subjectId: completed.id,
        metadata: { prototypeVersionId: version.id },
        actor: 'Alex',
      },
    ]);

    const otherFeed = await activityRepo.listByProject(otherProject.id, {});
    expect(otherFeed.items).toEqual([]);
  });

  it('does not record another activity when an already-complete playtest is updated again', async () => {
    const playtest = await playtests.create(project.id, {
      prototypeVersionId: version.id,
      name: 'Vertical slice',
    });
    await playtests.update(project.id, playtest.id, { status: 'complete' });

    await playtests.update(project.id, playtest.id, { summary: 'Wrapped up' });

    const feed = await activityRepo.listByProject(project.id, {});
    expect(feed.items.filter((item) => item.type === 'playtest_completed')).toHaveLength(1);
  });

  it('does not record an activity for updates that leave status untouched', async () => {
    const playtest = await playtests.create(project.id, {
      prototypeVersionId: version.id,
      name: 'Vertical slice',
    });

    await playtests.update(project.id, playtest.id, { summary: 'Still running' });

    const feed = await activityRepo.listByProject(project.id, {});
    expect(feed.items).toEqual([]);
  });
});

describe('sessions', () => {
  it('numbers sessions monotonically within the playtest', async () => {
    const playtest = await playtests.create(project.id, {
      prototypeVersionId: version.id,
      name: 'Vertical slice',
    });

    const first = await playtests.recordSession(project.id, playtest.id, { participant: 'Alex' });
    const second = await playtests.recordSession(project.id, playtest.id, { participant: 'Sam' });

    expect(first.sessionNumber).toBe(1);
    expect(second.sessionNumber).toBe(2);
  });
});

describe('observations', () => {
  it('requires the session to belong to the playtest', async () => {
    const playtest = await playtests.create(project.id, {
      prototypeVersionId: version.id,
      name: 'Vertical slice',
    });
    const otherPlaytest = await playtests.create(project.id, {
      prototypeVersionId: version.id,
      name: 'Another playtest',
    });
    const foreignSession = await playtests.recordSession(project.id, otherPlaytest.id, {});

    await expect(
      playtests.recordObservation(project.id, playtest.id, {
        sessionId: foreignSession.id,
        body: 'Got stuck at the trench',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('checks the referenced entity exists in this project', async () => {
    const playtest = await playtests.create(project.id, {
      prototypeVersionId: version.id,
      name: 'Vertical slice',
    });

    await expect(
      playtests.recordObservation(project.id, playtest.id, {
        entityId: 'missing-entity',
        body: 'Got stuck at the trench',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('records an observation tied to a session and an entity', async () => {
    const diver = await entities.create(project.id, { type: 'character', name: 'The Diver' });
    const playtest = await playtests.create(project.id, {
      prototypeVersionId: version.id,
      name: 'Vertical slice',
    });
    const session = await playtests.recordSession(project.id, playtest.id, {});

    const observation = await playtests.recordObservation(project.id, playtest.id, {
      sessionId: session.id,
      entityId: diver.id,
      atSeconds: 42,
      body: 'Got stuck at the trench',
      tags: ['bug', 'BUG'],
    });

    expect(observation).toMatchObject({
      sessionId: session.id,
      entityId: diver.id,
      atSeconds: 42,
      body: 'Got stuck at the trench',
      tags: ['bug'],
    });
  });
});

describe('feedback', () => {
  it('keeps feedback distinct from observations, with no entity link', async () => {
    const playtest = await playtests.create(project.id, {
      prototypeVersionId: version.id,
      name: 'Vertical slice',
    });

    const feedback = await playtests.recordFeedback(project.id, playtest.id, {
      body: 'I loved the pacing!',
      sentiment: 'positive',
      author: 'Playtester 1',
    });

    expect(feedback).not.toHaveProperty('entityId');
    expect(feedback).toMatchObject({ sentiment: 'positive', author: 'Playtester 1' });
  });
});

describe('metrics', () => {
  it('mints a metric key from the label', async () => {
    const playtest = await playtests.create(project.id, {
      prototypeVersionId: version.id,
      name: 'Vertical slice',
    });

    const metric = await playtests.recordMetric(project.id, playtest.id, {
      label: 'Completion rate',
      value: 0.8,
      unit: '%',
    });

    expect(metric.metricKey).toBe('completion-rate');
  });

  it('reuses the same key for repeated measurements of the same metric', async () => {
    const playtest = await playtests.create(project.id, {
      prototypeVersionId: version.id,
      name: 'Vertical slice',
    });
    const sessionOne = await playtests.recordSession(project.id, playtest.id, {});
    const sessionTwo = await playtests.recordSession(project.id, playtest.id, {});

    const first = await playtests.recordMetric(project.id, playtest.id, {
      sessionId: sessionOne.id,
      label: 'Session duration',
      value: 120,
      unit: 's',
    });
    const second = await playtests.recordMetric(project.id, playtest.id, {
      sessionId: sessionTwo.id,
      label: 'Session duration',
      value: 90,
      unit: 's',
    });

    expect(first.metricKey).toBe(second.metricKey);
  });

  it('mints a different key when a different label collides on the same slug', async () => {
    const playtest = await playtests.create(project.id, {
      prototypeVersionId: version.id,
      name: 'Vertical slice',
    });

    const first = await playtests.recordMetric(project.id, playtest.id, {
      label: 'Completion rate',
      value: 1,
    });
    const second = await playtests.recordMetric(project.id, playtest.id, {
      label: 'Completion Rate!',
      value: 2,
    });

    expect(second.metricKey).not.toBe(first.metricKey);
    expect(second.metricKey).toBe('completion-rate-2');
  });
});
