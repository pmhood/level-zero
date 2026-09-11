import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { sequentialIdGenerator } from '../shared/id';
import {
  createReviewDecision,
  pinJudgement,
  resolveReviewState,
  type ReviewState,
} from './review-decision';
import { requireReviewTarget, type ResolvedReviewTarget } from './review-target';

const ids = sequentialIdGenerator('decision');
const entityTarget = { type: 'entity', id: 'entity-1' } as const;
const target = requireReviewTarget('target', entityTarget);

function resolved(overrides: Partial<ResolvedReviewTarget> = {}): ResolvedReviewTarget {
  return {
    target,
    label: 'The Diver',
    archived: false,
    currentVersionId: 'version-2',
    ...overrides,
  };
}

function decision(
  state: ReviewState,
  options: { versionId?: string | null; at?: string; actor?: string } = {},
) {
  return createReviewDecision(
    {
      projectId: 'project-1',
      target: { ...entityTarget, versionId: options.versionId ?? null },
      state,
      actor: options.actor ?? 'ada',
    },
    { clock: fixedClock(options.at ?? '2026-03-01T09:00:00.000Z'), ids },
  );
}

describe('pinJudgement', () => {
  it('pins an approval to the version in force', () => {
    expect(pinJudgement(target, 'approved', resolved()).versionId).toBe('version-2');
  });

  it('pins a rejection too, so it does not condemn later work', () => {
    expect(pinJudgement(target, 'rejected', resolved()).versionId).toBe('version-2');
  });

  it('leaves a workflow move unpinned, so it follows the target', () => {
    expect(pinJudgement(target, 'review', resolved()).versionId).toBeNull();
  });

  it('keeps a version the reviewer named, so an old one can be approved deliberately', () => {
    const pinned = requireReviewTarget('target', { ...entityTarget, versionId: 'version-1' });

    expect(pinJudgement(pinned, 'approved', resolved()).versionId).toBe('version-1');
  });

  it('leaves a target with no versions unpinned', () => {
    const asset = requireReviewTarget('target', { type: 'asset', id: 'asset-1' });

    expect(
      pinJudgement(asset, 'approved', resolved({ target: asset, currentVersionId: null }))
        .versionId,
    ).toBeNull();
  });
});

describe('resolveReviewState', () => {
  it('reads as draft when nothing has been decided', () => {
    expect(resolveReviewState([], resolved())).toMatchObject({
      state: 'draft',
      decision: null,
      staleDecision: null,
    });
  });

  it('takes the newest applicable decision', () => {
    const status = resolveReviewState([decision('review')], resolved());

    expect(status.state).toBe('review');
    expect(status.decision?.actor).toBe('ada');
  });

  it('applies a judgement pinned to the version in force', () => {
    const status = resolveReviewState(
      [decision('approved', { versionId: 'version-2' })],
      resolved(),
    );

    expect(status.state).toBe('approved');
    expect(status.staleDecision).toBeNull();
  });

  it('does not let an approval of an earlier version approve the current one', () => {
    const approvedV1 = decision('approved', { versionId: 'version-1' });

    const status = resolveReviewState([approvedV1], resolved());

    expect(status.state).toBe('draft');
    expect(status.decision).toBeNull();
    expect(status.staleDecision).toEqual(approvedV1);
  });

  it('does not fall back to an earlier decision when the newest has gone stale', () => {
    const approvedV1 = decision('approved', {
      versionId: 'version-1',
      at: '2026-03-02T09:00:00.000Z',
    });
    const inReview = decision('review', { at: '2026-03-01T09:00:00.000Z' });

    const status = resolveReviewState([approvedV1, inReview], resolved());

    expect(status.state).toBe('draft');
    expect(status.staleDecision).toEqual(approvedV1);
  });

  it('never reports a stale judgement beside a state it did not set', () => {
    // Approving before the first commit records no version, so the row would go
    // on applying for ever if an older decision were allowed to win.
    const approvedUnpinned = decision('approved', { at: '2026-03-01T09:00:00.000Z' });
    const approvedV1 = decision('approved', {
      versionId: 'version-1',
      at: '2026-03-02T09:00:00.000Z',
    });

    const status = resolveReviewState([approvedV1, approvedUnpinned], resolved());

    expect(status.state).toBe('draft');
    expect(status.decision).toBeNull();
    expect(status.staleDecision).toEqual(approvedV1);
  });

  it('lets a newer decision supersede an older pinned judgement', () => {
    const newer = decision('review', { at: '2026-03-03T09:00:00.000Z' });
    const olderPinned = decision('approved', {
      versionId: 'version-1',
      at: '2026-03-02T09:00:00.000Z',
    });

    const status = resolveReviewState([newer, olderPinned], resolved());

    expect(status.state).toBe('review');
    expect(status.staleDecision).toBeNull();
  });

  it('reads an approval of the only version as current, even before a second one exists', () => {
    const status = resolveReviewState(
      [decision('approved', { versionId: 'version-1' })],
      resolved({ currentVersionId: 'version-1' }),
    );

    expect(status.state).toBe('approved');
  });

  it('still reports a state when the target itself has gone', () => {
    expect(resolveReviewState([decision('rejected')], null)).toMatchObject({
      target: null,
      state: 'rejected',
    });
  });

  it('treats a pinned judgement as stale for a target that no longer resolves', () => {
    const status = resolveReviewState([decision('approved', { versionId: 'version-1' })], null);

    expect(status.state).toBe('draft');
    expect(status.staleDecision?.state).toBe('approved');
  });
});
