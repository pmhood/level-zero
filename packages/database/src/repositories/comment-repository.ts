import {
  NotFoundError,
  type Comment,
  type CommentRepository,
  type ReviewTargetFilter,
  type ReviewTargetType,
} from '@level-zero/domain';
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import { comments } from '../schema/reviews';
import { toComment, toCommentRow } from './mappers';

/**
 * Postgres adapter for the domain's `CommentRepository` port.
 *
 * Every statement carries the project, including the lookups by primary key, so
 * another project's comment reads as missing rather than forbidden.
 */
export class DrizzleCommentRepository implements CommentRepository {
  constructor(private readonly db: Database) {}

  async insert(comment: Comment): Promise<Comment> {
    const [row] = await this.db.insert(comments).values(toCommentRow(comment)).returning();

    if (!row) throw new Error('Insert returned no comment row');
    return toComment(row);
  }

  async findById(projectId: string, commentId: string): Promise<Comment | null> {
    const [row] = await this.db
      .select()
      .from(comments)
      .where(and(eq(comments.projectId, projectId), eq(comments.id, commentId)))
      .limit(1);

    return row ? toComment(row) : null;
  }

  async listByTarget(projectId: string, filter: ReviewTargetFilter): Promise<Comment[]> {
    const rows = await this.db
      .select()
      .from(comments)
      .where(and(eq(comments.projectId, projectId), ...targetConditions(filter)))
      .orderBy(asc(comments.createdAt), asc(comments.id));

    return rows.map(toComment);
  }

  /** Every section's comments at once: the anchored rows, oldest first. */
  async listAnchoredByTarget(
    projectId: string,
    targetType: ReviewTargetType,
    targetId: string,
  ): Promise<Comment[]> {
    const rows = await this.db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.projectId, projectId),
          eq(comments.targetType, targetType),
          eq(comments.targetId, targetId),
          isNotNull(comments.targetAnchor),
        ),
      )
      .orderBy(asc(comments.createdAt), asc(comments.id));

    return rows.map(toComment);
  }

  async save(comment: Comment): Promise<Comment> {
    const [row] = await this.db
      .update(comments)
      .set(toCommentRow(comment))
      .where(and(eq(comments.id, comment.id), eq(comments.projectId, comment.projectId)))
      .returning();

    if (!row) throw new NotFoundError('Comment', comment.id);
    return toComment(row);
  }

  /** Replies go with the thread: the parent foreign key cascades. */
  async remove(projectId: string, commentId: string): Promise<void> {
    await this.db
      .delete(comments)
      .where(and(eq(comments.projectId, projectId), eq(comments.id, commentId)));
  }
}

/**
 * The target the caller named, matched exactly as `ReviewTargetFilter` promises:
 * a null anchor is `is null` rather than a skipped condition, because a
 * document's own thread and the threads on its sections are separate
 * conversations.
 */
function targetConditions(filter: ReviewTargetFilter) {
  return [
    eq(comments.targetType, filter.targetType),
    eq(comments.targetId, filter.targetId),
    filter.anchor === null
      ? isNull(comments.targetAnchor)
      : eq(comments.targetAnchor, filter.anchor),
  ];
}
