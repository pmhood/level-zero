import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  createFinding,
  dismissFinding,
  resolveFinding,
  type CheckFinding,
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

/** Everything a check reports, before the runner says what kind of claim it is. */
const reported: CheckFinding & { projectId: string; checkId: string } = {
  projectId: 'project-1',
  checkId: 'stale-prototype-pin',
  fingerprint: 'fingerprint-1',
  severity: 'warning',
  summary: 'The Diver has changed since this prototype version pinned it.',
  evidence,
};

function input(overrides: Partial<typeof reported> = {}): CreateFindingInput {
  return { ...reported, origin: 'deterministic', ...overrides };
}

function finding(overrides: Partial<typeof reported> = {}): Finding {
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

  it('carries the judgement that produced an ai_assisted finding', () => {
    const aiFinding = createFinding(
      { ...reported, origin: 'ai_assisted', generationId: 'generation-1' },
      { clock, ids: sequentialIdGenerator('finding') },
    );

    expect(aiFinding).toMatchObject({ origin: 'ai_assisted', generationId: 'generation-1' });
  });

  it('refuses an ai_assisted finding with no generation behind it', () => {
    expect(() =>
      createFinding(
        // @ts-expect-error the union already forbids this; the guard is for
        // callers that reach here without the types.
        { ...reported, origin: 'ai_assisted' },
        { clock, ids: sequentialIdGenerator('finding') },
      ),
    ).toThrow(ValidationError);
  });

  it('refuses to attach a generation to a deterministic finding', () => {
    // @ts-expect-error a proof has no judgement behind it, by construction.
    const rejected: CreateFindingInput = {
      ...reported,
      origin: 'deterministic',
      generationId: 'g',
    };
    expect(rejected.origin).toBe('deterministic');
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

describe('resolveFinding', () => {
  it('closes an open finding, recording when the scan stopped seeing it', () => {
    const resolved = resolveFinding(finding(), { clock: laterClock });

    expect(resolved).toMatchObject({ status: 'resolved', resolvedAt: laterClock.now() });
  });

  it('leaves a dismissed finding dismissed', () => {
    const dismissed = dismissFinding(finding(), { dismissedBy: 'pete' }, { clock: laterClock });

    const resolved = resolveFinding(dismissed, { clock: laterClock });

    expect(resolved).toBe(dismissed);
  });

  it('is a no-op on an already-resolved finding', () => {
    const resolved = resolveFinding(finding(), { clock: laterClock });

    expect(resolveFinding(resolved, { clock: laterClock })).toBe(resolved);
  });
});
