import type { Entity } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import { REFERENCEABLE_ENTITY_TYPES } from '@/features/entities/entity-reference';

import {
  MECHANIC_ENTITY_TYPES,
  MECHANIC_RATIONALE_FIELD,
  narrowMechanics,
  readMechanic,
  writeMechanic,
} from './mechanic';

function mechanic(data: Record<string, unknown> = {}): Entity {
  return {
    id: 'ent_1',
    projectId: 'prj_1',
    type: 'mechanic',
    name: 'Oxygen management',
    description: null,
    status: 'draft',
    tags: [],
    data,
    currentVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };
}

describe('readMechanic', () => {
  it('reads the structured fields out of the entity data', () => {
    const entity = mechanic({
      area: 'resources',
      fantasy: 'Air is running out.',
      rules: ['Oxygen drains faster while sprinting'],
      inputs: ['Tank capacity'],
      outputs: ['Time pressure'],
      implementationStatus: 'prototyped',
    });

    expect(readMechanic(entity)).toEqual({
      area: 'resources',
      fantasy: 'Air is running out.',
      rules: ['Oxygen drains faster while sprinting'],
      inputs: ['Tank capacity'],
      outputs: ['Time pressure'],
      implementationStatus: 'prototyped',
    });
  });

  it('opens an entity that has none of them — a mechanic promoted from an idea', () => {
    expect(readMechanic(mechanic())).toEqual({
      area: 'core_loop',
      fantasy: '',
      rules: [],
      inputs: [],
      outputs: [],
      implementationStatus: 'concept',
    });
  });

  it('falls back rather than trusting a value `data` cannot constrain', () => {
    const entity = mechanic({
      area: 'not_an_area',
      implementationStatus: 42,
      rules: ['keep me', 7, null],
      inputs: 'not a list',
      fantasy: { nope: true },
    });

    const read = readMechanic(entity);
    expect(read.area).toBe('core_loop');
    expect(read.implementationStatus).toBe('concept');
    expect(read.rules).toEqual(['keep me']);
    expect(read.inputs).toEqual([]);
    expect(read.fantasy).toBe('');
  });
});

describe('writeMechanic', () => {
  it('keeps the fields it does not own, because the API replaces data wholesale', () => {
    const rationale = { type: 'doc', content: [] };
    const entity = mechanic({
      area: 'economy',
      [MECHANIC_RATIONALE_FIELD]: rationale,
      tuningParameters: [{ id: 'p1', label: 'Base capacity' }],
    });

    const written = writeMechanic(entity, { implementationStatus: 'designed' });

    expect(written.area).toBe('economy');
    expect(written.implementationStatus).toBe('designed');
    expect(written[MECHANIC_RATIONALE_FIELD]).toEqual(rationale);
    expect(written.tuningParameters).toEqual([{ id: 'p1', label: 'Base capacity' }]);
  });
});

describe('narrowMechanics', () => {
  const combat = mechanic({ area: 'combat', implementationStatus: 'implemented' });
  const economy = {
    ...mechanic({ area: 'economy', implementationStatus: 'concept' }),
    id: 'ent_2',
  };

  it('narrows by the fields the listing endpoint cannot reach inside JSONB', () => {
    expect(narrowMechanics([combat, economy], { area: 'combat' })).toEqual([combat]);
    expect(narrowMechanics([combat, economy], { implementationStatus: 'concept' })).toEqual([
      economy,
    ]);
  });

  it('returns everything when nothing is narrowed', () => {
    expect(narrowMechanics([combat, economy], {})).toHaveLength(2);
  });
});

describe('mechanics elsewhere in the workspace', () => {
  it('are entity types a design document can reference, so `@` in the GDD finds them', () => {
    for (const type of MECHANIC_ENTITY_TYPES) {
      expect(REFERENCEABLE_ENTITY_TYPES).toContain(type);
    }
  });
});
