import { beforeEach, describe, expect, it } from 'vitest';

import { createEntity, type Entity } from '../entity/entity';
import { fixedClock } from '../shared/clock';
import { sequentialIdGenerator } from '../shared/id';
import {
  type AiCheckCandidate,
  type AiCheckContext,
  type AiJudgementRequest,
  type AiRetrievalRequest,
} from './ai-consistency-check';
import { type ProjectFacts } from './consistency-check';
import { nearDuplicateCheck } from './near-duplicate-check';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
// A fresh generator per test, so ids stay single-digit and sort the way they
// were created: `entity-10` would otherwise sort before `entity-9`.
let deps = { clock, ids: sequentialIdGenerator('entity') };

let asked: AiJudgementRequest[];
let probed: AiRetrievalRequest[];

beforeEach(() => {
  asked = [];
  probed = [];
  deps = { clock, ids: sequentialIdGenerator('entity') };
});

/**
 * An AI context whose index proposes the given neighbours for every probe, and
 * whose judgement answers with `output`.
 */
function retrieving(
  neighbours: Record<string, AiCheckCandidate[]>,
  output: string,
): AiCheckContext {
  return {
    retrieve: (request) => {
      probed.push(request);
      return Promise.resolve(neighbours[request.excludeEntityId ?? ''] ?? []);
    },
    judge: (request) => {
      asked.push(request);
      return Promise.resolve({ generationId: 'generation-1', output });
    },
  };
}

function duplicateOf(entityIds: readonly string[]): string {
  return JSON.stringify({
    findings: [
      {
        severity: 'warning',
        summary: 'These two read as the same idea written up twice.',
        evidence: entityIds.map((entityId) => ({
          entityId,
          where: 'Name and description',
          states: 'describes the same concept',
        })),
      },
    ],
  });
}

function entity(overrides: Partial<Parameters<typeof createEntity>[0]> = {}): Entity {
  return createEntity(
    { projectId: 'project-1', type: 'mechanic', name: 'Oxygen drain', ...overrides },
    deps,
  );
}

function facts(entities: readonly Entity[]): ProjectFacts {
  return { projectId: 'project-1', entities, prototypeVersions: [] };
}

describe('nearDuplicateCheck', () => {
  it('lets retrieval propose the pair and the judgement decide it', async () => {
    const first = entity();
    const second = entity({ name: 'Air supply drain' });

    const result = await nearDuplicateCheck.run(
      facts([first, second]),
      retrieving(
        { [first.id]: [{ entityId: second.id, score: 0.82 }] },
        duplicateOf([first.id, second.id]),
      ),
    );

    expect(result).toMatchObject({ generationId: 'generation-1' });
    expect(result?.findings).toHaveLength(1);
    expect(asked[0]?.contextEntityIds).toEqual([first.id, second.id]);
    expect(asked[0]?.prompt).toContain(`(id: ${first.id})`);
  });

  it('judges nothing when retrieval proposes nothing', async () => {
    const result = await nearDuplicateCheck.run(
      facts([entity(), entity({ name: 'Air supply drain' })]),
      retrieving({}, duplicateOf([])),
    );

    expect(result).toBeNull();
    expect(asked).toEqual([]);
    expect(probed).toHaveLength(2);
  });

  it('puts a pair found from both ends to the model once', async () => {
    const first = entity();
    const second = entity({ name: 'Air supply drain' });

    await nearDuplicateCheck.run(
      facts([first, second]),
      retrieving(
        {
          [first.id]: [{ entityId: second.id, score: 0.7 }],
          [second.id]: [{ entityId: first.id, score: 0.7 }],
        },
        duplicateOf([first.id, second.id]),
      ),
    );

    expect(asked).toHaveLength(1);
    expect(asked[0]?.contextEntityIds).toHaveLength(2);
  });

  it('leaves the pairs duplicate-name already proves to the deterministic check', async () => {
    const first = entity({ name: 'The Diver', type: 'character' });
    const sameName = entity({ name: 'the diver!', type: 'character' });

    const result = await nearDuplicateCheck.run(
      facts([first, sameName]),
      retrieving({ [first.id]: [{ entityId: sameName.id, score: 0.99 }] }, duplicateOf([])),
    );

    expect(result).toBeNull();
    expect(asked).toEqual([]);
  });

  it('still judges two same-named entities of different types', async () => {
    const character = entity({ name: 'Leviathan', type: 'character' });
    const hazard = entity({ name: 'Leviathan', type: 'hazard' });

    await nearDuplicateCheck.run(
      facts([character, hazard]),
      retrieving(
        { [character.id]: [{ entityId: hazard.id, score: 0.95 }] },
        duplicateOf([character.id, hazard.id]),
      ),
    );

    expect(asked).toHaveLength(1);
  });

  it('never probes from or proposes an archived entity', async () => {
    const live = entity();
    const archived = { ...entity({ name: 'Old oxygen drain' }), status: 'archived' as const };

    const result = await nearDuplicateCheck.run(
      facts([live, archived]),
      retrieving({ [live.id]: [{ entityId: archived.id, score: 0.9 }] }, duplicateOf([])),
    );

    expect(result).toBeNull();
    expect(probed.map((request) => request.excludeEntityId)).toEqual([live.id]);
  });

  it('ignores a proposal for an entity outside the project it was given', async () => {
    const live = entity();
    const other = entity({ name: 'Air supply drain' });

    const result = await nearDuplicateCheck.run(
      // `other` is retrieved but is not in this project's facts.
      facts([live]),
      retrieving({ [live.id]: [{ entityId: other.id, score: 0.9 }] }, duplicateOf([])),
    );

    expect(result).toBeNull();
    expect(asked).toEqual([]);
  });
});
