import { type Clock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { optionalText, requireText } from '../shared/validation';
import { type ReviewTarget, type ReviewTargetInput, requireReviewTarget } from './review-target';

export const MAX_COMMENT_BODY_LENGTH = 5000;
export const MAX_COMMENT_AUTHOR_LENGTH = 200;

/**
 * One note about a reviewable target, or a reply to one.
 *
 * `body` is plain text, not `RichTextEditor` content. Rich text in this
 * codebase is *the material being designed* — a GDD, lore, a character
 * background, a playtest write-up — stored as the editor's JSON in an entity's
 * `data`. A comment is a short remark about that material, closer to
 * `playtest_feedback.note` or `findings.dismissedReason`, and keeping it text
 * means it can be searched, truncated and quoted without a renderer.
 *
 * A comment is never stored inside its target's `data`: threads are rows here,
 * so they survive the target being renamed, archived or replaced.
 */
export interface Comment {
  id: string;
  projectId: string;
  target: ReviewTarget;
  /** The comment that starts this thread. Null when this is that comment. */
  parentCommentId: string | null;
  /** Free text until authentication lands; then a user id. */
  author: string;
  body: string;
  /** Set while the thread is resolved. Moves with `resolvedBy`, never alone. */
  resolvedAt: Date | null;
  resolvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCommentInput {
  projectId: string;
  target: ReviewTargetInput;
  author: string;
  body: string;
  parentCommentId?: string | null;
}

export interface CommentFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createComment(input: CreateCommentInput, deps: CommentFactoryDeps): Comment {
  const now = deps.clock.now();

  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    target: requireReviewTarget('target', input.target),
    parentCommentId: optionalText('parentCommentId', input.parentCommentId, 200),
    author: requireText('author', input.author, MAX_COMMENT_AUTHOR_LENGTH),
    body: requireText('body', input.body, MAX_COMMENT_BODY_LENGTH),
    resolvedAt: null,
    resolvedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Replaces the text of a comment. The target and the author never change.
 *
 * The only thing that moves `updatedAt`: it is what a reader is shown as
 * "edited", so resolving a thread must not make the comment inside it look
 * rewritten.
 */
export function applyCommentEdit(comment: Comment, body: string, deps: { clock: Clock }): Comment {
  return {
    ...comment,
    body: requireText('body', body, MAX_COMMENT_BODY_LENGTH),
    updatedAt: deps.clock.now(),
  };
}

/**
 * Marks a thread dealt with, recording who decided that.
 *
 * Idempotent on an already-resolved thread, like `resolveFinding`: the first
 * resolver keeps the credit and a second click is not an error.
 */
export function resolveComment(
  comment: Comment,
  resolvedBy: string,
  deps: { clock: Clock },
): Comment {
  requireThreadStart(comment, 'resolved');
  if (comment.resolvedAt !== null) return comment;

  return {
    ...comment,
    resolvedAt: deps.clock.now(),
    resolvedBy: requireText('resolvedBy', resolvedBy, MAX_COMMENT_AUTHOR_LENGTH),
  };
}

/**
 * Reopens a resolved thread, clearing the resolution rather than leaving it
 * stale so an open thread never reads as still resolved by someone. A thread
 * that is already open is returned unchanged.
 */
export function reopenComment(comment: Comment): Comment {
  requireThreadStart(comment, 'reopened');
  if (comment.resolvedAt === null) return comment;

  return { ...comment, resolvedAt: null, resolvedBy: null };
}

/** A thread: the comment that started it and the replies under it, oldest first. */
export interface CommentThread {
  comment: Comment;
  replies: Comment[];
}

/**
 * Groups a target's comments into threads, oldest thread first.
 *
 * Threads are one level deep — a reply cannot be replied to — so this is a
 * grouping rather than a tree walk. A reply whose parent is not in the input is
 * left out: every reply carries its parent's target, so that can only happen to
 * a caller which filtered the list itself.
 */
export function groupCommentThreads(comments: readonly Comment[]): CommentThread[] {
  const threads = new Map<string, CommentThread>();

  for (const comment of [...comments].sort(byOldest)) {
    if (comment.parentCommentId === null) threads.set(comment.id, { comment, replies: [] });
  }
  for (const comment of [...comments].sort(byOldest)) {
    if (comment.parentCommentId !== null) {
      threads.get(comment.parentCommentId)?.replies.push(comment);
    }
  }

  return [...threads.values()];
}

function byOldest(a: Comment, b: Comment): number {
  return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
}

function requireThreadStart(comment: Comment, verb: string): void {
  if (comment.parentCommentId !== null) {
    throw new ValidationError(`Only the comment that starts a thread can be ${verb}`, {
      field: 'commentId',
      commentId: comment.id,
      parentCommentId: comment.parentCommentId,
    });
  }
}
