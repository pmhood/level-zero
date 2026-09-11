import { REVIEW_STATES, REVIEW_TARGET_TYPES } from '@level-zero/domain';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { entityVersions } from './entity-versions';
import { projects } from './projects';

export const reviewTargetTypeEnum = pgEnum('review_target_type', REVIEW_TARGET_TYPES);
export const reviewStateEnum = pgEnum('review_state', REVIEW_STATES);

/**
 * Discussion about the things a project is made of.
 *
 * `target_id` deliberately carries no foreign key, the same choice
 * `activities.subject_id` makes and for the same reason: which table it names
 * is decided by `target_type`, and a thread has to outlive whatever it is
 * about. What the reader sees is resolved on every read, so renaming the target
 * changes nothing here and archiving it leaves the thread intact.
 *
 * `version_id` is the one reference that *is* enforced, compositely against
 * `(id, entity_id, project_id)`: a comment that names a version of a specific
 * entity cannot name another entity's or another project's history. It is null
 * for anything without versions, which the check constraint keeps honest.
 *
 * Bodies are plain text. Rich text in this codebase is the material being
 * designed, stored as editor JSON in an entity's `data`; a comment is a remark
 * about that material, so it is text like `playtest_feedback.note`.
 */
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    targetType: reviewTargetTypeEnum('target_type').notNull(),
    /** The target's own id. No foreign key: see the table comment. */
    targetId: uuid('target_id').notNull(),
    /** A stable address inside the target — a GDD section. Null is the whole target. */
    targetAnchor: text('target_anchor'),
    /** Set on the `entity` target's immutable version, when a comment names one. */
    versionId: uuid('version_id'),
    /** Null on the comment that starts a thread; replies point at it. */
    parentCommentId: uuid('parent_comment_id'),
    /** Free text until authentication lands; then a user id. */
    author: text('author').notNull(),
    body: text('body').notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    /** Free text until authentication lands; then a user id. */
    resolvedBy: text('resolved_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A reply belongs to a thread in the same project, and goes when it goes.
    foreignKey({
      columns: [table.parentCommentId, table.projectId],
      foreignColumns: [table.id, table.projectId],
      name: 'comments_parent_fk',
    }).onDelete('cascade'),
    // A commented version cannot be deleted out from under the thread about it.
    foreignKey({
      columns: [table.versionId, table.targetId, table.projectId],
      foreignColumns: [entityVersions.id, entityVersions.entityId, entityVersions.projectId],
      name: 'comments_version_fk',
    }).onDelete('restrict'),
    // What the reply foreign key above references.
    unique('comments_id_project_id_key').on(table.id, table.projectId),
    // Every read is scoped by project, and threads are read one target at a time.
    index('comments_project_target_idx').on(table.projectId, table.targetType, table.targetId),
    check(
      'comments_resolution_consistency',
      sql`(${table.resolvedAt} is null) = (${table.resolvedBy} is null)`,
    ),
    // Resolution belongs to the thread, so a reply can never carry one.
    check(
      'comments_replies_are_not_resolvable',
      sql`${table.parentCommentId} is null or ${table.resolvedAt} is null`,
    ),
    // Only an entity has versions to pin to.
    check(
      'comments_version_is_entity_only',
      sql`${table.versionId} is null or ${table.targetType} = 'entity'`,
    ),
  ],
);

/**
 * One explicit act of review, kept forever.
 *
 * Rows are only ever inserted: a target's state is the newest decision that
 * still applies, read by `resolveReviewState`, rather than a column something
 * overwrites. That is what keeps "who approved what" answerable, and it is the
 * same insert-only shape as `activities` and `entity_versions`.
 *
 * The composite foreign key on `version_id` is the guarantee behind
 * version-specific approval: a judgement names one entity version, the database
 * refuses a version belonging to another entity or project, and `ON DELETE
 * RESTRICT` keeps the reviewed version alive for as long as the decision cites
 * it. Deleting a whole project still works, because `project_id` cascades and
 * clears these rows before the versions they restrict.
 */
export const reviewDecisions = pgTable(
  'review_decisions',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    targetType: reviewTargetTypeEnum('target_type').notNull(),
    /** The target's own id. No foreign key, for the reason `comments` gives. */
    targetId: uuid('target_id').notNull(),
    targetAnchor: text('target_anchor'),
    /** The version a judgement was made against. Null when it names none. */
    versionId: uuid('version_id'),
    state: reviewStateEnum('state').notNull(),
    /** Free text until authentication lands; then a user id. Never null: an approval is somebody's. */
    actor: text('actor').notNull(),
    note: text('note'),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.versionId, table.targetId, table.projectId],
      foreignColumns: [entityVersions.id, entityVersions.entityId, entityVersions.projectId],
      name: 'review_decisions_version_fk',
    }).onDelete('restrict'),
    // Every read is scoped by project, and a target's history is read newest first.
    index('review_decisions_project_target_idx').on(
      table.projectId,
      table.targetType,
      table.targetId,
      table.decidedAt,
    ),
    check(
      'review_decisions_version_is_entity_only',
      sql`${table.versionId} is null or ${table.targetType} = 'entity'`,
    ),
  ],
);

export type CommentRow = typeof comments.$inferSelect;
export type NewCommentRow = typeof comments.$inferInsert;
export type ReviewDecisionRow = typeof reviewDecisions.$inferSelect;
export type NewReviewDecisionRow = typeof reviewDecisions.$inferInsert;
