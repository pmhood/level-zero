import { beforeEach, describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { sequentialIdGenerator } from '../shared/id';
import { InMemoryActivityRepository } from '../testing';
import { ActivityService } from './activity-service';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let repo: InMemoryActivityRepository;
let activity: ActivityService;

beforeEach(() => {
  repo = new InMemoryActivityRepository();
  activity = new ActivityService(repo, { clock, ids: sequentialIdGenerator('activity') });
});

describe('recording activity', () => {
  it('stores a compact record with the summary as given, without touching a subject', async () => {
    const recorded = await activity.record({
      projectId: 'project-a',
      type: 'entity_created',
      summary: 'Kael created',
      subjectType: 'entity',
      subjectId: 'entity-1',
      metadata: { entityType: 'character' },
      actor: 'user-1',
    });

    expect(recorded).toMatchObject({
      id: 'activity-1',
      projectId: 'project-a',
      type: 'entity_created',
      summary: 'Kael created',
      subjectType: 'entity',
      subjectId: 'entity-1',
      metadata: { entityType: 'character' },
      actor: 'user-1',
    });
    expect(recorded.createdAt).toBeInstanceOf(Date);
  });

  it('records a null actor when the caller does not know who acted', async () => {
    const recorded = await activity.record({
      projectId: 'project-a',
      type: 'entity_created',
      summary: 'Kael created',
      subjectType: 'entity',
      subjectId: 'entity-1',
    });

    expect(recorded.actor).toBeNull();
  });
});

describe('reading the feed', () => {
  it('is scoped to one project — another project never leaks in', async () => {
    await activity.record({
      projectId: 'project-a',
      type: 'entity_created',
      summary: 'A entity created',
      subjectType: 'entity',
      subjectId: 'a-1',
    });
    await activity.record({
      projectId: 'project-b',
      type: 'entity_created',
      summary: 'B entity created',
      subjectType: 'entity',
      subjectId: 'b-1',
    });

    const feed = await activity.listByProject('project-a', {});

    expect(feed.total).toBe(1);
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({ projectId: 'project-a', summary: 'A entity created' });
  });

  it('orders reliably, newest first', async () => {
    for (let i = 1; i <= 3; i += 1) {
      await activity.record({
        projectId: 'project-a',
        type: 'entity_created',
        summary: `Entity ${i} created`,
        subjectType: 'entity',
        subjectId: `entity-${i}`,
      });
    }

    const feed = await activity.listByProject('project-a', {});

    expect(feed.items.map((item) => item.summary)).toEqual([
      'Entity 3 created',
      'Entity 2 created',
      'Entity 1 created',
    ]);
  });

  it('filters by type, for a view that only cares about one event class', async () => {
    await activity.record({
      projectId: 'project-a',
      type: 'entity_created',
      summary: 'Kael created',
      subjectType: 'entity',
      subjectId: 'entity-1',
    });
    await activity.record({
      projectId: 'project-a',
      type: 'entity_archived',
      summary: 'Kael archived',
      subjectType: 'entity',
      subjectId: 'entity-1',
    });

    const feed = await activity.listByProject('project-a', { types: ['entity_archived'] });

    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]?.type).toBe('entity_archived');
  });

  it('filters by subject, for a contextual workspace view', async () => {
    await activity.record({
      projectId: 'project-a',
      type: 'entity_created',
      summary: 'Kael created',
      subjectType: 'entity',
      subjectId: 'entity-1',
    });
    await activity.record({
      projectId: 'project-a',
      type: 'entity_created',
      summary: 'Riven created',
      subjectType: 'entity',
      subjectId: 'entity-2',
    });

    const feed = await activity.listByProject('project-a', { subjectId: 'entity-1' });

    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({ subjectId: 'entity-1', summary: 'Kael created' });
  });

  it('keeps rendering a useful entry after its subject changes state entirely', async () => {
    const created = await activity.record({
      projectId: 'project-a',
      type: 'entity_created',
      summary: 'Kael created',
      subjectType: 'entity',
      subjectId: 'entity-1',
      metadata: { entityType: 'character', name: 'Kael' },
    });

    // The entity this row is about no longer exists in this test's world at
    // all — there is no repository lookup here to break. The row is a
    // durable, precomputed sentence, not a live join.
    const feed = await activity.listByProject('project-a', {});

    expect(feed.items.find((item) => item.id === created.id)).toMatchObject({
      summary: 'Kael created',
      subjectId: 'entity-1',
    });
  });
});
