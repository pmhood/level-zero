import type { Entity, EntityType } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import { environmentTags, narrowWorldEntities, orderByEra, readWorld, writeWorld } from './world';

function worldEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_belt',
    projectId: 'prj_1',
    type: 'region' as EntityType,
    name: 'The Shattered Belt',
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

describe('readWorld', () => {
  it('reads an entity that has never been through this workspace as an empty draft', () => {
    expect(readWorld(worldEntity())).toEqual({ era: '', canonStatus: 'proposed', risk: 'none' });
  });

  it('falls back rather than trusting a value outside the vocabulary', () => {
    const entity = worldEntity({ data: { era: 42, canonStatus: 'agreed', risk: 'apocalyptic' } });

    expect(readWorld(entity)).toEqual({ era: '', canonStatus: 'proposed', risk: 'none' });
  });
});

describe('writeWorld', () => {
  it('keeps the data another tool wrote, including the lore document', () => {
    const entity = worldEntity({
      data: {
        era: 'c. 2226',
        canonStatus: 'canon',
        risk: 'high',
        lore: { type: 'doc', content: [] },
        somethingElse: 'not this workspace’s field',
      },
    });

    expect(writeWorld(entity, { canonStatus: 'contested' })).toEqual({
      era: 'c. 2226',
      canonStatus: 'contested',
      risk: 'high',
      lore: { type: 'doc', content: [] },
      somethingElse: 'not this workspace’s field',
    });
  });
});

describe('narrowWorldEntities', () => {
  const belt = worldEntity({ tags: ['Vacuum'], data: { canonStatus: 'canon' } });
  const wardens = worldEntity({
    id: 'ent_wardens',
    type: 'faction',
    name: 'The Wardens',
    tags: ['Military'],
  });

  it('narrows by type', () => {
    expect(narrowWorldEntities([belt, wardens], { type: 'faction' })).toEqual([wardens]);
  });

  it('narrows by a canon status that lives in data, which the API cannot filter on', () => {
    expect(narrowWorldEntities([belt, wardens], { canonStatus: 'canon' })).toEqual([belt]);
  });

  it('narrows by tag', () => {
    expect(narrowWorldEntities([belt, wardens], { tag: 'Vacuum' })).toEqual([belt]);
  });

  it('applies every narrowing at once', () => {
    expect(narrowWorldEntities([belt, wardens], { type: 'region', tag: 'Military' })).toEqual([]);
  });
});

describe('orderByEra', () => {
  it('sorts a setting’s own calendar numerically, earliest first', () => {
    const collapse = worldEntity({ id: 'a', name: 'The Collapse', data: { era: 'c. 2226' } });
    const expansion = worldEntity({ id: 'b', name: 'The Expansion', data: { era: 'c. 2180' } });

    expect(orderByEra([collapse, expansion]).map((event) => event.name)).toEqual([
      'The Expansion',
      'The Collapse',
    ]);
  });

  it('puts undated events last, where they read as work still to do', () => {
    const undated = worldEntity({ id: 'a', name: 'Something happened' });
    const dated = worldEntity({ id: 'b', name: 'The Drift', data: { era: 'c. 2230' } });

    expect(orderByEra([undated, dated]).map((event) => event.name)).toEqual([
      'The Drift',
      'Something happened',
    ]);
  });
});

describe('environmentTags', () => {
  it('counts the vocabulary the world already uses, commonest first', () => {
    const entities = [
      worldEntity({ id: 'a', tags: ['Vacuum', 'Contested'] }),
      worldEntity({ id: 'b', tags: ['Vacuum'] }),
      worldEntity({ id: 'c', tags: [] }),
    ];

    expect(environmentTags(entities)).toEqual([
      { tag: 'Vacuum', count: 2 },
      { tag: 'Contested', count: 1 },
    ]);
  });
});
