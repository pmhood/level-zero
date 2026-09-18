import type {
  AnchoredReviewStatus,
  Comment,
  CommentThread,
  Finding,
  FindingEvidence,
} from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import {
  orphanedAnchors,
  sectionFindings,
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

describe('sectionFindings', () => {
  function finding(id: string, evidence: FindingEvidence[]): Finding {
    return {
      id,
      projectId: 'prj_1',
      checkId: 'stale-section-reference',
      fingerprint: id,
      origin: 'deterministic',
      generationId: null,
      severity: 'warning',
      summary: 'Kael has changed.',
      evidence,
      status: 'open',
      firstSeenAt: new Date('2026-03-02T09:00:00.000Z'),
      lastSeenAt: new Date('2026-03-02T09:00:00.000Z'),
      resolvedAt: null,
      dismissedAt: null,
      dismissedBy: null,
      dismissedReason: null,
    };
  }

  const onSection = (id: string, anchor: string) =>
    finding(id, [
      { entityId: 'doc_1', anchor, where: 'Core loop', states: 'approved' },
      { entityId: 'ent_kael', where: 'Kael', states: 'has changed' },
    ]);

  it('groups findings by the section their evidence addresses', () => {
    const grouped = sectionFindings(
      [onSection('fnd_1', 'section-core-loop'), onSection('fnd_2', 'section-pillars')],
      'doc_1',
    );

    expect([...grouped.keys()]).toEqual(['section-core-loop', 'section-pillars']);
    expect(grouped.get('section-core-loop')?.map((item) => item.id)).toEqual(['fnd_1']);
  });

  it('collects every finding about one section', () => {
    const grouped = sectionFindings(
      [onSection('fnd_1', 'section-core-loop'), onSection('fnd_2', 'section-core-loop')],
      'doc_1',
    );

    expect(grouped.get('section-core-loop')?.map((item) => item.id)).toEqual(['fnd_1', 'fnd_2']);
  });

  it('leaves out evidence with no anchor, which is about the whole document', () => {
    const wholeDocument = finding('fnd_1', [
      { entityId: 'doc_1', where: 'Game Design Document', states: 'also named GDD' },
      { entityId: 'doc_2', where: 'GDD', states: 'also named Game Design Document' },
    ]);

    expect(sectionFindings([wholeDocument], 'doc_1').size).toBe(0);
  });

  it('leaves out an anchor that belongs to another document', () => {
    expect(sectionFindings([onSection('fnd_1', 'section-core-loop')], 'doc_2').size).toBe(0);
  });
});
