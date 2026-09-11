import { beforeEach, describe, expect, it } from 'vitest';

import { documentData } from '../document/document';
import { createEntity, type Entity } from '../entity/entity';
import { fixedClock } from '../shared/clock';
import { sequentialIdGenerator } from '../shared/id';
import { type AiCheckContext, type AiJudgementRequest } from './ai-consistency-check';
import { type ProjectFacts } from './consistency-check';
import { loreContradictionCheck } from './lore-contradiction-check';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
// A fresh generator per test, so ids stay single-digit and sort the way they
// were created: `entity-10` would otherwise sort before `entity-9`.
let deps = { clock, ids: sequentialIdGenerator('entity') };

let asked: AiJudgementRequest[];

beforeEach(() => {
  asked = [];
  deps = { clock, ids: sequentialIdGenerator('entity') };
});

/** An AI context that answers with whatever the test wants judged. */
function judging(output: string): AiCheckContext {
  return {
    retrieve: () => Promise.resolve([]),
    judge: (request) => {
      asked.push(request);
      return Promise.resolve({ generationId: 'generation-1', output });
    },
  };
}

function contradiction(entityIds: readonly string[]): string {
  return JSON.stringify({
    findings: [
      {
        severity: 'warning',
        summary: 'The two accounts of the flood read as though they describe one event twice.',
        evidence: entityIds.map((entityId) => ({
          entityId,
          where: 'Description',
          states: 'dates the flood differently',
        })),
      },
    ],
  });
}

function lore(overrides: Partial<Parameters<typeof createEntity>[0]> = {}): Entity {
  return createEntity(
    {
      projectId: 'project-1',
      type: 'lore',
      name: 'The Flood',
      description: 'The flood came in the ninth year of the Deep.',
      ...overrides,
    },
    deps,
  );
}

function facts(entities: readonly Entity[]): ProjectFacts {
  return { projectId: 'project-1', entities, prototypeVersions: [] };
}

describe('loreContradictionCheck', () => {
  it('judges the project narrative and attributes the findings to the generation', async () => {
    const first = lore();
    const second = lore({ name: 'The Drowning', description: 'The waters rose in year eleven.' });

    const result = await loreContradictionCheck.run(
      facts([first, second]),
      judging(contradiction([first.id, second.id])),
    );

    expect(result).toMatchObject({ generationId: 'generation-1' });
    expect(result?.findings).toHaveLength(1);
    expect(result?.findings[0]?.evidence.map((piece) => piece.entityId)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it('names the objects and their ids in the prompt, and puts them in context', async () => {
    const first = lore();
    const second = lore({ name: 'The Drowning', description: 'The waters rose in year eleven.' });

    await loreContradictionCheck.run(facts([first, second]), judging('{"findings":[]}'));

    expect(asked[0]?.contextEntityIds).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(asked[0]?.prompt).toContain(`"The Flood" [lore] (id: ${first.id})`);
  });

  it('reads a document entity whose writing lives in its content', async () => {
    const gdd = createEntity(
      {
        projectId: 'project-1',
        type: 'document',
        name: 'Design doc',
        data: documentData({
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'The flood came in year two.' }] },
          ],
        }),
      },
      deps,
    );

    await loreContradictionCheck.run(facts([lore(), gdd]), judging('{"findings":[]}'));

    expect(asked[0]?.contextEntityIds).toContain(gdd.id);
  });

  it('leaves out mechanics, archived entries and objects that say nothing yet', async () => {
    const mechanic = createEntity(
      {
        projectId: 'project-1',
        type: 'mechanic',
        name: 'Oxygen',
        description: 'Oxygen drains while exploring.',
      },
      deps,
    );
    const archived = { ...lore({ name: 'Cut lore' }), status: 'archived' as const };
    const blank = lore({ name: 'Untitled', description: null });

    await loreContradictionCheck.run(
      facts([lore(), lore({ name: 'The Drowning' }), mechanic, archived, blank]),
      judging('{"findings":[]}'),
    );

    const inContext = asked[0]?.contextEntityIds ?? [];
    expect(inContext).not.toContain(mechanic.id);
    expect(inContext).not.toContain(archived.id);
    expect(inContext).not.toContain(blank.id);
  });

  it('judges nothing when the project has fewer than two narrative objects', async () => {
    const result = await loreContradictionCheck.run(facts([lore()]), judging(contradiction([])));

    expect(result).toBeNull();
    expect(asked).toEqual([]);
  });

  it('drops a judgement that cites an object it was never shown', async () => {
    const first = lore();
    const second = lore({ name: 'The Drowning' });

    const result = await loreContradictionCheck.run(
      facts([first, second]),
      judging(contradiction([first.id, 'entity-from-another-project'])),
    );

    expect(result?.findings).toEqual([]);
  });

  it('lets a failed judgement fail the check rather than reporting nothing found', async () => {
    const broken: AiCheckContext = {
      retrieve: () => Promise.resolve([]),
      judge: () => Promise.reject(new Error('anthropic is unreachable')),
    };

    await expect(
      loreContradictionCheck.run(facts([lore(), lore({ name: 'The Drowning' })]), broken),
    ).rejects.toThrow('anthropic is unreachable');
  });
});
