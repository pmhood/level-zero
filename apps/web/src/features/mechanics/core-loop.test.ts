import type { Entity, NeighborEdge, RelationType } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import {
  LOOP_STEP_ORDER_FIELD,
  moveStep,
  orderLoopSteps,
  stepIds,
  writeStepOrder,
} from './core-loop';

function entity(id: string, name: string, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    projectId: 'prj_1',
    type: 'mechanic',
    name,
    description: null,
    status: 'active',
    tags: [],
    data: {},
    currentVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    ...overrides,
  };
}

function edge(id: string, target: Entity, relation: RelationType = 'contains'): NeighborEdge {
  return {
    direction: 'outgoing',
    entity: target,
    relationship: {
      id,
      projectId: 'prj_1',
      sourceEntityId: 'loop_1',
      targetEntityId: target.id,
      relation,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

const EXPLORE = entity('ent_explore', 'Explore');
const SCAVENGE = entity('ent_scavenge', 'Scavenge');
const UPGRADE = entity('ent_upgrade', 'Upgrade');

function loop(order: unknown = undefined): Entity {
  return entity('loop_1', 'Core loop', {
    type: 'system',
    data: order === undefined ? {} : { [LOOP_STEP_ORDER_FIELD]: order },
  });
}

describe('orderLoopSteps', () => {
  it('orders the mechanics a loop contains by the order stored on the loop', () => {
    const steps = orderLoopSteps(loop(['ent_upgrade', 'ent_explore', 'ent_scavenge']), [
      edge('rel_1', EXPLORE),
      edge('rel_2', SCAVENGE),
      edge('rel_3', UPGRADE),
    ]);

    expect(steps.map((step) => step.entity.name)).toEqual(['Upgrade', 'Explore', 'Scavenge']);
    expect(steps[0]!.relationshipId).toBe('rel_3');
  });

  it('holds the steps themselves, never a copy of them', () => {
    const [step] = orderLoopSteps(loop(['ent_explore']), [edge('rel_1', EXPLORE)]);

    expect(step!.entity).toBe(EXPLORE);
  });

  it('ignores relations that are not loop membership', () => {
    const steps = orderLoopSteps(loop(), [
      edge('rel_1', EXPLORE),
      edge('rel_2', SCAVENGE, 'references'),
    ]);

    expect(steps.map((step) => step.entity.name)).toEqual(['Explore']);
  });

  it('drops a step whose edge is gone, even while its id is still ordered', () => {
    const steps = orderLoopSteps(loop(['ent_explore', 'ent_scavenge']), [edge('rel_1', EXPLORE)]);

    expect(steps.map((step) => step.entity.id)).toEqual(['ent_explore']);
  });

  it('appends a linked mechanic the order has never heard of rather than hiding it', () => {
    const steps = orderLoopSteps(loop(['ent_upgrade']), [
      edge('rel_1', EXPLORE),
      edge('rel_3', UPGRADE),
    ]);

    expect(steps.map((step) => step.entity.name)).toEqual(['Upgrade', 'Explore']);
  });

  it('keeps an archived step in place instead of leaving a hole in the loop', () => {
    const archived = entity('ent_scavenge', 'Scavenge', { status: 'archived' });
    const steps = orderLoopSteps(loop(['ent_explore', 'ent_scavenge']), [
      edge('rel_1', EXPLORE),
      edge('rel_2', archived),
    ]);

    expect(steps.map((step) => step.entity.status)).toEqual(['active', 'archived']);
  });

  it('reads an order that is missing or the wrong shape as no order at all', () => {
    const edges = [edge('rel_1', EXPLORE), edge('rel_2', SCAVENGE)];

    expect(orderLoopSteps(loop('nonsense'), edges)).toHaveLength(2);
    expect(orderLoopSteps(loop([1, 'ent_scavenge']), edges).map((s) => s.entity.id)).toEqual([
      'ent_scavenge',
      'ent_explore',
    ]);
  });
});

describe('moveStep', () => {
  const steps = orderLoopSteps(loop(['ent_explore', 'ent_scavenge', 'ent_upgrade']), [
    edge('rel_1', EXPLORE),
    edge('rel_2', SCAVENGE),
    edge('rel_3', UPGRADE),
  ]);

  it('moves a step later', () => {
    expect(stepIds(moveStep(steps, 0, 1))).toEqual(['ent_scavenge', 'ent_explore', 'ent_upgrade']);
  });

  it('moves a step earlier', () => {
    expect(stepIds(moveStep(steps, 2, -1))).toEqual(['ent_explore', 'ent_upgrade', 'ent_scavenge']);
  });

  it('will not move a step off either end of the loop', () => {
    expect(stepIds(moveStep(steps, 0, -1))).toEqual(stepIds(steps));
    expect(stepIds(moveStep(steps, 2, 1))).toEqual(stepIds(steps));
  });
});

describe('writeStepOrder', () => {
  it('writes only the order and keeps the rest of the loop entity data', () => {
    const withNotes = entity('loop_1', 'Core loop', {
      type: 'system',
      data: { area: 'core_loop', [LOOP_STEP_ORDER_FIELD]: ['ent_explore'] },
    });

    expect(writeStepOrder(withNotes, ['ent_scavenge', 'ent_explore'])).toEqual({
      area: 'core_loop',
      [LOOP_STEP_ORDER_FIELD]: ['ent_scavenge', 'ent_explore'],
    });
  });
});
