import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  applyCommentEdit,
  createComment,
  groupCommentThreads,
  reopenComment,
  resolveComment,
} from './comment';
import { requireReviewTarget } from './review-target';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const laterClock = fixedClock('2026-03-01T10:00:00.000Z');
const ids = sequentialIdGenerator('comment');
const target = requireReviewTarget('target', { type: 'entity', id: 'entity-1' });

function seed(overrides: { author?: string; parentCommentId?: string | null } = {}) {
  return createComment(
    {
      projectId: 'project-1',
      target,
      author: overrides.author ?? 'ada',
      body: 'The oxygen drain reads high for a first dive.',
      parentCommentId: overrides.parentCommentId ?? null,
    },
    { clock, ids },
  );
}

describe('createComment', () => {
  it('starts unresolved', () => {
    expect(seed()).toMatchObject({ resolvedAt: null, resolvedBy: null });
  });

  it('rejects an empty body', () => {
    expect(() =>
      createComment({ projectId: 'project-1', target, author: 'ada', body: '   ' }, { clock, ids }),
    ).toThrow(ValidationError);
  });

  it('rejects a body longer than the limit', () => {
    expect(() =>
      createComment(
        { projectId: 'project-1', target, author: 'ada', body: 'x'.repeat(5001) },
        { clock, ids },
      ),
    ).toThrow(ValidationError);
  });
});

describe('resolveComment', () => {
  it('records who resolved a thread and when', () => {
    const thread = resolveComment(seed(), 'kai', { clock: laterClock });

    expect(thread.resolvedBy).toBe('kai');
    expect(thread.resolvedAt).toEqual(new Date('2026-03-01T10:00:00.000Z'));
  });

  it('leaves updatedAt alone, so a resolved comment does not read as edited', () => {
    const comment = seed();

    expect(resolveComment(comment, 'kai', { clock: laterClock }).updatedAt).toEqual(
      comment.updatedAt,
    );
  });

  it('keeps the first resolver when resolved twice', () => {
    const thread = resolveComment(seed(), 'kai', { clock });

    expect(resolveComment(thread, 'ada', { clock: laterClock }).resolvedBy).toBe('kai');
  });

  it('refuses to resolve a reply', () => {
    expect(() => resolveComment(seed({ parentCommentId: 'comment-1' }), 'kai', { clock })).toThrow(
      ValidationError,
    );
  });
});

describe('reopenComment', () => {
  it('clears the resolution rather than leaving it stale', () => {
    const thread = resolveComment(seed(), 'kai', { clock });

    expect(reopenComment(thread)).toMatchObject({
      resolvedAt: null,
      resolvedBy: null,
    });
  });

  it('leaves an open thread alone', () => {
    const thread = seed();

    expect(reopenComment(thread)).toEqual(thread);
  });
});

describe('applyCommentEdit', () => {
  it('keeps the author and the target', () => {
    const edited = applyCommentEdit(seed(), 'Reads high for a first dive, surely?', {
      clock: laterClock,
    });

    expect(edited).toMatchObject({
      author: 'ada',
      target,
      body: 'Reads high for a first dive, surely?',
    });
    expect(edited.updatedAt).toEqual(new Date('2026-03-01T10:00:00.000Z'));
  });
});

describe('groupCommentThreads', () => {
  it('groups replies under the comment that started the thread, oldest first', () => {
    const first = seed();
    const reply = { ...seed({ parentCommentId: first.id }), id: 'comment-reply' };
    const second = { ...seed(), id: 'comment-second' };

    const threads = groupCommentThreads([reply, second, first]);

    expect(threads.map((thread) => thread.comment.id)).toEqual([first.id, 'comment-second']);
    expect(threads[0]?.replies.map((item) => item.id)).toEqual(['comment-reply']);
    expect(threads[1]?.replies).toEqual([]);
  });

  it('leaves out a reply whose thread is not in the list', () => {
    expect(groupCommentThreads([seed({ parentCommentId: 'gone' })])).toEqual([]);
  });
});
