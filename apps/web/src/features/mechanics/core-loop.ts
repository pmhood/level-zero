import type { Entity, NeighborEdge, RelationType } from '@level-zero/domain';

/**
 * A loop's steps are the mechanics it `contains`. The step is the mechanic
 * entity itself — the loop holds an edge to it, never a copy of it.
 */
export const LOOP_STEP_RELATION: RelationType = 'contains';

/** The field of a loop entity's `data` holding the order of its steps. */
export const LOOP_STEP_ORDER_FIELD = 'stepOrder';

export interface LoopStep {
  /** The `contains` edge, so a step can be removed without touching either entity. */
  relationshipId: string;
  entity: Entity;
}

/**
 * The ordered steps of one loop.
 *
 * Membership and sequence are stored apart on purpose. Membership is a
 * `contains` edge, so it is canonical, visible from both ends and removed by
 * unlinking; the sequence is the loop's own design decision and lives in the
 * loop entity's `data`, where reordering is one write and is captured by the
 * entity's version history — relationship metadata is not versioned.
 *
 * The edges win: a mechanic whose edge is gone drops out of the loop even if
 * its id is still listed, and one linked without being listed is appended
 * rather than hidden.
 */
export function orderLoopSteps(loop: Entity, outgoing: readonly NeighborEdge[]): LoopStep[] {
  const order = readStepOrder(loop);

  return outgoing
    .filter((edge) => edge.relationship.relation === LOOP_STEP_RELATION)
    .map((edge) => ({ relationshipId: edge.relationship.id, entity: edge.entity }))
    .sort((a, b) => rank(order, a.entity.id) - rank(order, b.entity.id));
}

/** Listed steps keep their position; unlisted ones follow, alphabetically. */
function rank(order: readonly string[], entityId: string): number {
  const index = order.indexOf(entityId);
  return index === -1 ? order.length : index;
}

export function readStepOrder(loop: Entity): string[] {
  const stored = loop.data[LOOP_STEP_ORDER_FIELD];
  return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
}

/** The `data` to PATCH for this order of steps; the rest of `data` is kept. */
export function writeStepOrder(
  loop: Entity,
  entityIds: readonly string[],
): Record<string, unknown> {
  return { ...loop.data, [LOOP_STEP_ORDER_FIELD]: [...entityIds] };
}

export function stepIds(steps: readonly LoopStep[]): string[] {
  return steps.map((step) => step.entity.id);
}

/** Moves one step by `offset` places, clamped to the ends of the loop. */
export function moveStep(steps: readonly LoopStep[], index: number, offset: number): LoopStep[] {
  const target = index + offset;
  if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) {
    return [...steps];
  }

  const next = [...steps];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}
