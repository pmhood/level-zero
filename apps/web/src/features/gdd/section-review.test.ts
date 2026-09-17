import type { AnchoredReviewStatus, Comment, CommentThread } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import {
  orphanedAnchors,
  sectionHeading,
  sectionStates,
  sectionTarget,
  unresolvedThreadCounts,
} from './section-review';

function thread(anchor: string | null, overrides: Partial<Comment> = {}): CommentThread {
  return {
    comment: {
      id: `cmt_${anchor ?? 'document'}`,
      projectId: 'prj_1',
      target: { type: 'entity', id: 'doc_1', anchor, versionId: null },
      parentCommentId: null,
      author: 'You',
      body: 'Still the old loop.',
      resolvedAt: null,
      resolvedBy: null,
      createdAt: new Date('2026-03-01T09:00:00.000Z'),
      updatedAt: new Date('2026-03-01T09:00:00.000Z'),
      ...overrides,
    },
    replies: [],
  };
}

function status(anchor: string, state: AnchoredReviewStatus['state']): AnchoredReviewStatus {
  return { anchor, state, decision: null };
}

describe('sectionTarget', () => {
  it('addresses a section as the document entity plus its heading’s id', () => {
    expect(sectionTarget('doc_1', 'section-a')).toEqual({
      targetType: 'entity',
      targetId: 'doc_1',
      anchor: 'section-a',
    });
  });
});

describe('sectionStates', () => {
  it('reads each anchor’s state, leaving an undecided section out', () => {
    const states = sectionStates([status('section-a', 'approved')]);

    expect(states.get('section-a')).toBe('approved');
    expect(states.has('section-b')).toBe(false);
  });
});

describe('unresolvedThreadCounts', () => {
  it('counts only the threads still open, per section', () => {
    const counts = unresolvedThreadCounts([
      thread('section-a', { id: 'cmt_1' }),
      thread('section-a', { id: 'cmt_2' }),
      thread('section-a', {
        id: 'cmt_3',
        resolvedAt: new Date('2026-03-02T09:00:00.000Z'),
        resolvedBy: 'You',
      }),
      thread(null, { id: 'cmt_4' }),
    ]);

    expect(counts.get('section-a')).toBe(2);
    expect(counts.size).toBe(1);
  });
});

describe('orphanedAnchors', () => {
  it('is empty while every anchor still names a section', () => {
    expect(
      orphanedAnchors(
        [thread('section-a')],
        [status('section-a', 'draft')],
        new Set(['section-a']),
      ),
    ).toEqual([]);
  });

  it('names an anchor whose section has been deleted, from a thread or a decision', () => {
    const orphans = orphanedAnchors(
      [thread('section-a'), thread('section-gone')],
      [status('section-a', 'approved'), status('section-also-gone', 'approved')],
      new Set(['section-a']),
    );

    expect(orphans).toEqual(['section-gone', 'section-also-gone']);
  });

  it('names an anchor once however many threads and decisions mention it', () => {
    const orphans = orphanedAnchors(
      [thread('section-gone', { id: 'cmt_1' }), thread('section-gone', { id: 'cmt_2' })],
      [status('section-gone', 'rejected')],
      new Set(),
    );

    expect(orphans).toEqual(['section-gone']);
  });
});

describe('sectionHeading', () => {
  it('names a heading nobody has titled yet', () => {
    expect(sectionHeading('  ')).toBe('Untitled section');
    expect(sectionHeading('Core loop')).toBe('Core loop');
  });
});
