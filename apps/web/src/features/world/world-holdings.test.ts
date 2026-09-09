import type {
  Entity,
  EntityNeighborhood,
  EntityType,
  NeighborEdge,
  RelationType,
} from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import { groupHoldings, type HoldingGroupKey } from './world-holdings';

function entity(id: string, name: string, type: EntityType): Entity {
  return {
    id,
    projectId: 'prj_1',
    type,
    name,
    description: null,
    status: 'active',
    tags: [],
    data: {},
    currentVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };
}

const BELT = entity('ent_belt', 'The Shattered Belt', 'region');

function edge(
  target: Entity,
  relation: RelationType,
  direction: 'outgoing' | 'incoming',
): NeighborEdge {
  return {
    relationship: {
      id: `rel_${target.id}_${relation}_${direction}`,
      projectId: 'prj_1',
      sourceEntityId: direction === 'outgoing' ? BELT.id : target.id,
      targetEntityId: direction === 'outgoing' ? target.id : BELT.id,
      relation,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    direction,
    entity: target,
  };
}

function neighborhood(...edges: NeighborEdge[]): EntityNeighborhood {
  return {
    entity: BELT,
    outgoing: edges.filter((one) => one.direction === 'outgoing'),
    incoming: edges.filter((one) => one.direction === 'incoming'),
  };
}

function named(groups: ReturnType<typeof groupHoldings>, key: HoldingGroupKey): string[] {
  return groups.find((group) => group.key === key)!.edges.map((one) => one.entity.name);
}

describe('groupHoldings', () => {
  it('reads a faction that controls the place as who holds it', () => {
    const wardens = entity('ent_wardens', 'The Wardens', 'faction');

    const groups = groupHoldings(neighborhood(edge(wardens, 'controls', 'incoming')));

    expect(named(groups, 'heldBy')).toEqual(['The Wardens']);
  });

  it('reads containment from both ends: what it holds and what holds it', () => {
    const station = entity('ent_veyl', 'Veyl Station', 'location');
    const expanse = entity('ent_expanse', 'Korvos Expanse', 'region');
    const claim = entity('ent_claim', 'Helix claim', 'faction');

    const groups = groupHoldings(
      neighborhood(
        edge(station, 'contains', 'outgoing'),
        edge(expanse, 'contains', 'incoming'),
        edge(claim, 'belongs_to', 'incoming'),
      ),
    );

    expect(named(groups, 'contains')).toEqual(['Veyl Station', 'Helix claim']);
    expect(named(groups, 'within')).toEqual(['Korvos Expanse']);
  });

  it('reads what appears here as what is at stake there', () => {
    const storm = entity('ent_storm', 'Radiation storms', 'hazard');
    const collapse = entity('ent_collapse', 'The Collapse', 'event');

    const groups = groupHoldings(
      neighborhood(edge(storm, 'appears_in', 'incoming'), edge(collapse, 'appears_in', 'incoming')),
    );

    expect(named(groups, 'presentHere')).toEqual(['Radiation storms', 'The Collapse']);
  });

  it('collects maps and references from either direction', () => {
    const map = entity('ent_map', 'Sector map', 'asset_reference');

    const groups = groupHoldings(neighborhood(edge(map, 'references', 'outgoing')));

    expect(named(groups, 'references')).toEqual(['Sector map']);
  });

  it('keeps an edge the setting vocabulary does not cover rather than dropping it', () => {
    const idea = entity('ent_idea', 'A frontier that eats ships', 'idea');

    const groups = groupHoldings(neighborhood(edge(idea, 'promoted_to', 'incoming')));

    expect(named(groups, 'other')).toEqual(['A frontier that eats ships']);
  });

  it('answers every clause even when the place has no edges at all', () => {
    const groups = groupHoldings(neighborhood());

    expect(groups.map((group) => group.key)).toEqual([
      'heldBy',
      'within',
      'contains',
      'presentHere',
      'references',
      'other',
    ]);
    expect(groups.every((group) => group.edges.length === 0)).toBe(true);
  });
});
