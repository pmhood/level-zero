import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  applyEntityUpdate,
  archiveEntity,
  createEntity,
  restoreEntity,
  type Entity,
} from './entity';
import { ENTITY_TYPES, isEntityType } from './entity-type';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const later = fixedClock('2026-03-02T09:00:00.000Z');

function deps(prefix = 'entity') {
  return { clock, ids: sequentialIdGenerator(prefix) };
}

function make(overrides: Partial<Parameters<typeof createEntity>[0]> = {}): Entity {
  return createEntity(
    { projectId: 'project-1', type: 'character', name: 'Kael', ...overrides },
    deps(),
  );
}

describe('entity types', () => {
  it('covers every type the architecture calls for', () => {
    expect(ENTITY_TYPES).toEqual([
      'idea',
      'design_pillar',
      'character',
      'location',
      'faction',
      'region',
      'lore',
      'event',
      'hazard',
      'culture',
      'technology',
      'mechanic',
      'system',
      'asset_reference',
      'scene',
      'document',
      'prototype',
      'build',
    ]);
  });

  it('recognises valid types and rejects anything else', () => {
    expect(isEntityType('mechanic')).toBe(true);
    expect(isEntityType('spaceship')).toBe(false);
    expect(isEntityType(7)).toBe(false);
  });
});

describe('createEntity', () => {
  it('creates a draft entity scoped to its project', () => {
    const entity = make();

    expect(entity).toMatchObject({
      id: 'entity-1',
      projectId: 'project-1',
      type: 'character',
      name: 'Kael',
      description: null,
      status: 'draft',
      tags: [],
      data: {},
      currentVersionId: null,
      archivedAt: null,
    });
    expect(entity.createdAt.toISOString()).toBe('2026-03-01T09:00:00.000Z');
    expect(entity.updatedAt).toEqual(entity.createdAt);
  });

  it('accepts type-specific data without a fixed schema', () => {
    const mechanic = make({
      type: 'mechanic',
      name: 'Oxygen Management',
      data: { loop: 'survival', tuning: { drainPerSecond: 0.4 }, tags: ['tense'] },
    });

    expect(mechanic.data).toEqual({
      loop: 'survival',
      tuning: { drainPerSecond: 0.4 },
      tags: ['tense'],
    });
  });

  it('copies data so later mutation of the input cannot leak in', () => {
    const input = { fuel: 10 };
    const entity = make({ data: input });
    input.fuel = 99;

    expect(entity.data.fuel).toBe(10);
  });

  it('trims the name and drops an empty description', () => {
    const entity = make({ name: '  Kael  ', description: '   ' });

    expect(entity.name).toBe('Kael');
    expect(entity.description).toBeNull();
  });

  it('normalises tags: trims, drops empties, dedupes case-insensitively', () => {
    const entity = make({ tags: [' Protagonist ', 'protagonist', '', 'Rebel'] });

    expect(entity.tags).toEqual(['Protagonist', 'Rebel']);
  });

  it.each([
    ['an empty name', { name: '   ' }],
    ['an unknown type', { type: 'spaceship' as never }],
    ['a non-object data value', { data: [1, 2, 3] as never }],
    ['a non-string tag', { tags: [42] as never }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => make(overrides)).toThrow(ValidationError);
  });

  it('refuses to create an entity that is already archived', () => {
    expect(() => make({ status: 'archived' })).toThrow(/archived/);
  });
});

describe('applyEntityUpdate', () => {
  it('returns a new entity and leaves the original untouched', () => {
    const entity = make();
    const updated = applyEntityUpdate(entity, { name: 'Kael Vex' }, { clock: later });

    expect(updated.name).toBe('Kael Vex');
    expect(entity.name).toBe('Kael');
    expect(updated.updatedAt.toISOString()).toBe('2026-03-02T09:00:00.000Z');
    expect(updated.createdAt).toEqual(entity.createdAt);
  });

  it('leaves fields the patch omits alone', () => {
    const entity = make({ description: 'A reluctant pilot', tags: ['Rebel'] });
    const updated = applyEntityUpdate(entity, { name: 'Kael Vex' }, { clock: later });

    expect(updated.description).toBe('A reluctant pilot');
    expect(updated.tags).toEqual(['Rebel']);
  });

  it('replaces data wholesale so a field can be removed', () => {
    const entity = make({ data: { fuel: 10, morale: 3 } });
    const updated = applyEntityUpdate(entity, { data: { fuel: 12 } }, { clock: later });

    expect(updated.data).toEqual({ fuel: 12 });
  });

  it('clears a description with an explicit null', () => {
    const entity = make({ description: 'A reluctant pilot' });

    expect(
      applyEntityUpdate(entity, { description: null }, { clock: later }).description,
    ).toBeNull();
  });

  it('promotes a draft to active', () => {
    expect(applyEntityUpdate(make(), { status: 'active' }, { clock: later }).status).toBe('active');
  });

  it('refuses to edit an archived entity', () => {
    const archived = archiveEntity(make(), { clock: later });

    expect(() => applyEntityUpdate(archived, { name: 'x' }, { clock: later })).toThrow(
      /restored before it can be edited/,
    );
  });
});

describe('archiveEntity / restoreEntity', () => {
  it('archives without deleting, keeping identity and data intact', () => {
    const entity = make({ data: { fuel: 10 } });
    const archived = archiveEntity(entity, { clock: later });

    expect(archived).toMatchObject({ id: entity.id, status: 'archived', data: { fuel: 10 } });
    expect(archived.archivedAt?.toISOString()).toBe('2026-03-02T09:00:00.000Z');
  });

  it('rejects archiving twice', () => {
    const archived = archiveEntity(make(), { clock: later });

    expect(() => archiveEntity(archived, { clock: later })).toThrow(ValidationError);
  });

  it('restores an archived entity as a draft', () => {
    const restored = restoreEntity(archiveEntity(make(), { clock: later }), { clock: later });

    expect(restored).toMatchObject({ status: 'draft', archivedAt: null });
  });

  it('rejects restoring an entity that is not archived', () => {
    expect(() => restoreEntity(make(), { clock: later })).toThrow(ValidationError);
  });
});
