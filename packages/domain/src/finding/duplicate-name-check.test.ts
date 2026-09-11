import { describe, expect, it } from 'vitest';

import { createEntity, type Entity } from '../entity/entity';
import { fixedClock } from '../shared/clock';
import { sequentialIdGenerator } from '../shared/id';
import { fingerprint, type ProjectFacts } from './consistency-check';
import { duplicateNameCheck } from './duplicate-name-check';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const projectId = 'project-1';

function entity(overrides: Partial<Parameters<typeof createEntity>[0]> = {}): Entity {
  return createEntity(
    { projectId, type: 'character', name: 'The Diver', ...overrides },
    { clock, ids: sequentialIdGenerator('entity') },
  );
}

function archived(base: Entity): Entity {
  return { ...base, status: 'archived', archivedAt: clock.now() };
}

function facts(overrides: Partial<ProjectFacts> = {}): ProjectFacts {
  return { projectId, entities: [], prototypeVersions: [], ...overrides };
}

describe('duplicateNameCheck', () => {
  it('flags two non-archived entities of the same type with the same normalised name', () => {
    const first = entity({ name: 'The Diver' });
    const second = entity({ name: 'The Diver' });

    const findings = duplicateNameCheck.run(facts({ entities: [first, second] }));

    const [sortedFirst, sortedSecond] = first.id <= second.id ? [first, second] : [second, first];
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      fingerprint: fingerprint('duplicate-name', 'character', sortedFirst.id, sortedSecond.id),
      severity: 'conflict',
      summary: `${sortedFirst.name} and ${sortedSecond.name} look like the same character.`,
      evidence: [
        {
          entityId: sortedFirst.id,
          where: sortedFirst.name,
          states: `also named ${sortedSecond.name}`,
        },
        {
          entityId: sortedSecond.id,
          where: sortedSecond.name,
          states: `also named ${sortedFirst.name}`,
        },
      ],
    });
  });

  it('produces the same fingerprint regardless of which entity is encountered first', () => {
    const first = entity({ name: 'The Diver' });
    const second = entity({ name: 'The Diver' });

    const inOrder = duplicateNameCheck.run(facts({ entities: [first, second] }));
    const reversed = duplicateNameCheck.run(facts({ entities: [second, first] }));

    expect(inOrder[0]?.fingerprint).toBe(reversed[0]?.fingerprint);
  });

  it('matches names that differ only by case and punctuation', () => {
    const first = entity({ name: 'The Diver' });
    const second = entity({ name: 'the-diver!!' });

    expect(duplicateNameCheck.run(facts({ entities: [first, second] }))).toHaveLength(1);
  });

  it('does not flag genuinely different names', () => {
    const first = entity({ name: 'The Diver' });
    const second = entity({ name: 'The Surveyor' });

    expect(duplicateNameCheck.run(facts({ entities: [first, second] }))).toEqual([]);
  });

  it('does not flag entities of different types even with matching names', () => {
    const first = entity({ type: 'character', name: 'Oxygen' });
    const second = entity({ type: 'mechanic', name: 'Oxygen' });

    expect(duplicateNameCheck.run(facts({ entities: [first, second] }))).toEqual([]);
  });

  it('does not flag an archived entity, either as the archived one or the survivor', () => {
    const first = archived(entity({ name: 'The Diver' }));
    const second = entity({ name: 'The Diver' });

    expect(duplicateNameCheck.run(facts({ entities: [first, second] }))).toEqual([]);
  });

  it('never scores similarity — only exact normalised matches produce a finding', () => {
    const first = entity({ name: 'The Diver' });
    const second = entity({ name: 'The Deep Sea Diver' });

    expect(duplicateNameCheck.run(facts({ entities: [first, second] }))).toEqual([]);
  });
});
