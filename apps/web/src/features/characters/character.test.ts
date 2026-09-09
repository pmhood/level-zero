import type { Entity } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import {
  characterRoles,
  characterTags,
  lifecycleStatuses,
  narrowCharacters,
  readCharacter,
  writeCharacter,
} from './character';

function character(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_kael',
    projectId: 'prj_1',
    type: 'character',
    name: 'Kael Voss',
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

describe('readCharacter', () => {
  it('reads an entity promoted from an idea as an empty character rather than failing', () => {
    expect(readCharacter(character())).toEqual({
      role: '',
      quote: '',
      traits: [],
      motivation: '',
      inventory: [],
    });
  });

  it('drops values of the wrong shape, because data is schemaless', () => {
    const stored = character({
      data: { role: 42, traits: ['Wary', 7, null], motivation: { text: 'no' }, inventory: 'none' },
    });

    expect(readCharacter(stored)).toMatchObject({
      role: '',
      traits: ['Wary'],
      motivation: '',
      inventory: [],
    });
  });

  it('keeps an inventory row only when it has a name', () => {
    const stored = character({
      data: {
        inventory: [
          { name: 'Cutting torch', note: "Her father's." },
          { name: 'Nav beacon' },
          { note: 'an entry with nothing to call it' },
          'a bare string',
        ],
      },
    });

    expect(readCharacter(stored).inventory).toEqual([
      { name: 'Cutting torch', note: "Her father's." },
      { name: 'Nav beacon', note: '' },
    ]);
  });
});

describe('writeCharacter', () => {
  it('carries over data this workspace does not own', () => {
    const stored = character({
      data: { role: 'Salvager', background: { type: 'doc' }, somethingElse: 1 },
    });

    expect(writeCharacter(stored, { role: 'Broker' })).toMatchObject({
      role: 'Broker',
      background: { type: 'doc' },
      somethingElse: 1,
    });
  });
});

describe('narrowCharacters', () => {
  const cast = [
    character({ id: 'a', data: { role: 'Salvager' }, tags: ['crew'] }),
    character({ id: 'b', data: { role: 'Broker' }, tags: ['crew', 'antagonist'] }),
    character({ id: 'c', data: {} }),
  ];

  it('returns everything when nothing is chosen', () => {
    expect(narrowCharacters(cast, {})).toHaveLength(3);
  });

  it('narrows by a role the listing endpoint cannot reach inside JSONB for', () => {
    expect(narrowCharacters(cast, { role: 'Broker' }).map((entity) => entity.id)).toEqual(['b']);
  });

  it('narrows by tag', () => {
    expect(narrowCharacters(cast, { tag: 'antagonist' }).map((entity) => entity.id)).toEqual(['b']);
  });

  it('applies role and tag together', () => {
    expect(narrowCharacters(cast, { role: 'Salvager', tag: 'antagonist' })).toEqual([]);
  });
});

describe('filter options', () => {
  const cast = [
    character({ id: 'a', data: { role: 'Salvager' }, tags: ['crew'] }),
    character({ id: 'b', data: { role: 'Broker' }, tags: ['crew'] }),
    character({ id: 'c', data: { role: '  ' }, tags: [] }),
  ];

  it('lists each role once, sorted, ignoring characters without one', () => {
    expect(characterRoles(cast)).toEqual(['Broker', 'Salvager']);
  });

  it('lists each tag once', () => {
    expect(characterTags(cast)).toEqual(['crew']);
  });
});

describe('lifecycleStatuses', () => {
  it('sends no status filter for the whole cast, so drafts and actives both show', () => {
    expect(lifecycleStatuses('cast')).toBeUndefined();
  });

  it('sends the chosen status otherwise', () => {
    expect(lifecycleStatuses('archived')).toEqual(['archived']);
  });
});
