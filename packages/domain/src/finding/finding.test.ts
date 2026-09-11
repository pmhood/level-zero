import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  createFinding,
  dismissFinding,
  type CreateFindingInput,
  type Finding,
  type FindingEvidence,
} from './finding';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const laterClock = fixedClock('2026-03-01T09:05:00.000Z');

const evidence: FindingEvidence[] = [
  { entityId: 'prototype-1', where: 'Prototype version 2', states: 'pinned to an earlier Diver' },
  { entityId: 'entity-1', where: 'The Diver', states: 'has a newer current version' },
];

function input(overrides: Partial<CreateFindingInput> = {}): CreateFindingInput {
  return {
    projectId: 'project-1',
    checkId: 'stale-prototype-pin',
    fingerprint: 'fingerprint-1',
    origin: 'deterministic',
    severity: 'warning',
    summary: 'The Diver has changed since this prototype version pinned it.',
    evidence,
    ...overrides,
  };
}

function finding(overrides: Partial<CreateFindingInput> = {}): Finding {
  return createFinding(input(overrides), { clock, ids: sequentialIdGenerator('finding') });
}

describe('createFinding', () => {
  it('starts a fresh fingerprint as open, with no lifecycle set', () => {
    expect(finding()).toMatchObject({
      id: 'finding-1',
      projectId: 'project-1',
      checkId: 'stale-prototype-pin',
      fingerprint: 'fingerprint-1',
      origin: 'deterministic',
      generationId: null,
      severity: 'warning',
      status: 'open',
      firstSeenAt: clock.now(),
      lastSeenAt: clock.now(),
      resolvedAt: null,
      dismissedAt: null,
      dismissedBy: null,
      dismissedReason: null,
    });
  });

  it('carries a generation id only when the origin is ai_assisted', () => {
    const aiFinding = finding({ origin: 'ai_assisted', generationId: 'generation-1' });
    expect(aiFinding.generationId).toBe('generation-1');
  });

  it('rejects a finding with fewer than two pieces of evidence', () => {
    expect(() => finding({ evidence: [evidence[0]!] })).toThrow(ValidationError);
  });

  it('rejects an invalid severity', () => {
    // @ts-expect-error deliberately invalid input
    expect(() => finding({ severity: 'critical' })).toThrow(ValidationError);
  });

  it('rejects an empty summary', () => {
    expect(() => finding({ summary: '   ' })).toThrow(ValidationError);
  });
});

describe('dismissFinding', () => {
  it('marks the finding dismissed and records who dismissed it', () => {
    const dismissed = dismissFinding(
      finding(),
      { dismissedBy: 'pete', reason: 'known trade-off' },
      {
        clock: laterClock,
      },
    );

    expect(dismissed).toMatchObject({
      status: 'dismissed',
      dismissedAt: laterClock.now(),
      dismissedBy: 'pete',
      dismissedReason: 'known trade-off',
    });
    // Dismissal never rewrites the derived content it found alongside.
    expect(dismissed.summary).toBe(finding().summary);
  });

  it('leaves the reason null when none is given', () => {
    const dismissed = dismissFinding(finding(), { dismissedBy: 'pete' }, { clock: laterClock });
    expect(dismissed.dismissedReason).toBeNull();
  });
});
