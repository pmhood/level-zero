import type { Entity, EntityStatus, EntityType } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import { entityReferenceLabel, matchEntities, resolveEntityReference } from './entity-reference';

function entity(
  id: string,
  name: string,
  type: EntityType = 'character',
  status: EntityStatus = 'active',
): Entity {
  return {
    id,
    projectId: 'prj_1',
    type,
    name,
    description: null,
    status,
    tags: [],
    data: {},
    currentVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };
}

const KAEL = entity('ent_kael', 'Kael Voss');
const OXYGEN = entity('ent_oxygen', 'Oxygen Management', 'mechanic');
const DRIFT = entity('ent_drift', 'Driftwake Station', 'location');

describe('matchEntities', () => {
  const entities = [DRIFT, KAEL, OXYGEN];

  it('returns every referenceable entity for an empty query', () => {
    expect(matchEntities(entities, '').map((match) => match.id)).toEqual([
      DRIFT.id,
      KAEL.id,
      OXYGEN.id,
    ]);
  });

  it('puts names that start with the query first', () => {
    expect(matchEntities(entities, 'a').map((match) => match.name)).toEqual([
      'Driftwake Station',
      'Kael Voss',
      'Oxygen Management',
    ]);
    expect(matchEntities(entities, 'oxy')[0]?.id).toBe(OXYGEN.id);
  });

  it('scopes to one type when the embed pickers ask it to', () => {
    expect(matchEntities(entities, '', { type: 'mechanic' }).map((m) => m.id)).toEqual([OXYGEN.id]);
  });

  it('leaves out types a document cannot reference', () => {
    const document = entity('ent_gdd', 'Game Design Document', 'document');

    expect(matchEntities([...entities, document], 'game')).toEqual([]);
  });

  it('leaves out archived entities, which can be kept but not newly referenced', () => {
    const retired = entity('ent_old', 'Kael Prototype', 'character', 'archived');

    expect(matchEntities([KAEL, retired], 'kael').map((match) => match.id)).toEqual([KAEL.id]);
  });

  it('caps the list so the menu stays a menu', () => {
    const many = Array.from({ length: 20 }, (_, index) => entity(`ent_${index}`, `Guard ${index}`));

    expect(matchEntities(many, 'guard')).toHaveLength(8);
    expect(matchEntities(many, 'guard', { limit: 3 })).toHaveLength(3);
  });
});

describe('resolveEntityReference', () => {
  it('finds the entity a reference points at, archived or not', () => {
    const archived = entity('ent_old', 'Old Kael', 'character', 'archived');

    expect(resolveEntityReference('ent_old', [KAEL, archived], false)).toEqual({
      state: 'found',
      entity: archived,
    });
  });

  it('waits rather than reporting a break while the entities are still loading', () => {
    expect(resolveEntityReference('ent_kael', [], true)).toEqual({ state: 'loading' });
  });

  it('reports a missing entity once the list has arrived without it', () => {
    expect(resolveEntityReference('ent_kael', [], false)).toEqual({ state: 'missing' });
  });
});

describe('entityReferenceLabel', () => {
  it('shows the entity name as it is now, not the one stored with the reference', () => {
    const renamed = { ...KAEL, name: 'Kael Ardent' };

    expect(entityReferenceLabel({ state: 'found', entity: renamed }, 'Kael Voss')).toBe(
      'Kael Ardent',
    );
  });

  it('falls back to the stored label so a broken reference still says what it was', () => {
    expect(entityReferenceLabel({ state: 'missing' }, 'Kael Voss')).toBe('Kael Voss');
  });
});
