import type { EntityNeighborhood, NeighborEdge } from '@level-zero/domain';

/**
 * The question this workspace's relationship view answers: for one place,
 * *who holds it, what is inside it, and what is at stake there?*
 *
 * Each group is one clause of that question, and an empty group is the useful
 * answer rather than a blank panel — a region nobody holds and where nothing
 * happens is a hole in the setting, and this is where it shows.
 */
export const HOLDING_GROUPS = [
  'heldBy',
  'within',
  'contains',
  'presentHere',
  'references',
  'other',
] as const;

export type HoldingGroupKey = (typeof HOLDING_GROUPS)[number];

export interface HoldingGroup {
  key: HoldingGroupKey;
  edges: NeighborEdge[];
}

/**
 * Sorts a place's one-hop neighbourhood into those clauses.
 *
 * Direction carries the meaning, so it is read rather than dropped: a faction
 * `controls` the place (incoming) is who holds it, while the place `contains`
 * something (outgoing) and something `belongs_to` the place (incoming) are
 * both ways of saying it is inside.
 *
 * Every edge lands in exactly one group; anything the setting vocabulary does
 * not cover falls through to `other` rather than disappearing from the graph.
 */
export function groupHoldings(neighborhood: EntityNeighborhood): HoldingGroup[] {
  const grouped = new Map<HoldingGroupKey, NeighborEdge[]>(HOLDING_GROUPS.map((key) => [key, []]));

  for (const edge of [...neighborhood.outgoing, ...neighborhood.incoming]) {
    grouped.get(holdingGroupOf(edge))!.push(edge);
  }

  return HOLDING_GROUPS.map((key) => ({ key, edges: grouped.get(key)! }));
}

function holdingGroupOf(edge: NeighborEdge): HoldingGroupKey {
  const outgoing = edge.direction === 'outgoing';

  switch (edge.relationship.relation) {
    case 'controls':
      return outgoing ? 'other' : 'heldBy';
    case 'contains':
      return outgoing ? 'contains' : 'within';
    case 'belongs_to':
      return outgoing ? 'within' : 'contains';
    case 'appears_in':
      return outgoing ? 'other' : 'presentHere';
    case 'references':
      return 'references';
    default:
      return 'other';
  }
}
