import { describe, expect, it } from 'vitest';

import { ValidationError } from '../shared/errors';
import { parseJudgedFindings } from './ai-judgement';

const citable = new Set(['entity-1', 'entity-2', 'entity-3']);

function answer(findings: unknown): string {
  return JSON.stringify({ findings });
}

const oneFinding = [
  {
    severity: 'conflict',
    summary: 'The two accounts of the flood read as though they describe one event twice.',
    evidence: [
      { entityId: 'entity-1', where: 'Description', states: 'dates the flood to year nine' },
      { entityId: 'entity-2', where: 'Description', states: 'dates it to year eleven' },
    ],
  },
];

describe('parseJudgedFindings', () => {
  it('reads a judgement into a finding, fingerprinted by the objects in tension', () => {
    const [finding] = parseJudgedFindings('lore-contradiction', answer(oneFinding), citable);

    expect(finding).toMatchObject({
      severity: 'conflict',
      summary: 'The two accounts of the flood read as though they describe one event twice.',
      evidence: [
        { entityId: 'entity-1', where: 'Description', states: 'dates the flood to year nine' },
        { entityId: 'entity-2', where: 'Description', states: 'dates it to year eleven' },
      ],
    });
    expect(finding?.fingerprint).toHaveLength(64);
  });

  it('fingerprints the same pair the same way however the model ordered or worded it', () => {
    const [first] = parseJudgedFindings('lore-contradiction', answer(oneFinding), citable);
    const reversed = [
      {
        ...oneFinding[0],
        summary: 'Different wording entirely.',
        evidence: [...oneFinding[0]!.evidence].reverse(),
      },
    ];

    const [second] = parseJudgedFindings('lore-contradiction', answer(reversed), citable);

    expect(second?.fingerprint).toBe(first?.fingerprint);
  });

  it('gives two checks different fingerprints for the same pair', () => {
    const [lore] = parseJudgedFindings('lore-contradiction', answer(oneFinding), citable);
    const [duplicate] = parseJudgedFindings('near-duplicate', answer(oneFinding), citable);

    expect(duplicate?.fingerprint).not.toBe(lore?.fingerprint);
  });

  it('reads a judgement the model wrapped in prose and a code fence', () => {
    const output = `Here is what I found:\n\n\`\`\`json\n${answer(oneFinding)}\n\`\`\`\n`;

    expect(parseJudgedFindings('lore-contradiction', output, citable)).toHaveLength(1);
  });

  it('drops evidence citing an object that never entered the context', () => {
    const invented = [
      {
        ...oneFinding[0],
        evidence: [
          oneFinding[0]!.evidence[0],
          {
            entityId: 'entity-from-another-project',
            where: 'Description',
            states: 'says otherwise',
          },
        ],
      },
    ];

    // One surviving side is not a contradiction, so nothing is reported at all.
    expect(parseJudgedFindings('lore-contradiction', answer(invented), citable)).toEqual([]);
  });

  it('keeps a finding whose remaining sides are both citable', () => {
    const partlyInvented = [
      {
        ...oneFinding[0],
        evidence: [
          ...oneFinding[0]!.evidence,
          { entityId: 'ghost', where: 'Description', states: 'says otherwise' },
        ],
      },
    ];

    const [finding] = parseJudgedFindings('lore-contradiction', answer(partlyInvented), citable);

    expect(finding?.evidence.map((piece) => piece.entityId)).toEqual(['entity-1', 'entity-2']);
  });

  it('reads an unrecognised severity as a warning rather than a conflict', () => {
    const shouting = [{ ...oneFinding[0], severity: 'catastrophic' }];

    const [finding] = parseJudgedFindings('lore-contradiction', answer(shouting), citable);

    expect(finding?.severity).toBe('warning');
  });

  it('skips an item with no summary rather than reporting an unexplained finding', () => {
    const empty = [{ ...oneFinding[0], summary: '   ' }];

    expect(parseJudgedFindings('lore-contradiction', answer(empty), citable)).toEqual([]);
  });

  it('reads a judgement that found nothing as nothing', () => {
    expect(parseJudgedFindings('lore-contradiction', answer([]), citable)).toEqual([]);
  });

  it('throws rather than reading an unreadable answer as "nothing found"', () => {
    expect(() =>
      parseJudgedFindings('lore-contradiction', 'I had a think about it.', citable),
    ).toThrow(ValidationError);
  });
});
