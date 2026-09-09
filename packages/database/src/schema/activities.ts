import { ACTIVITY_SUBJECT_TYPES, ACTIVITY_TYPES } from '@level-zero/domain';
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects';

export const activityTypeEnum = pgEnum('activity_type', ACTIVITY_TYPES);
export const activitySubjectTypeEnum = pgEnum('activity_subject_type', ACTIVITY_SUBJECT_TYPES);

/**
 * One meaningful, project-scoped event, worded once and kept forever.
 *
 * Rows are only ever inserted — there is no update or delete, the same as an
 * entity version. `subject_id` deliberately carries no foreign key: which
 * table it names is decided by `subject_type`, and a subject may be archived
 * or gone by the time the row is read, which `summary` and `metadata` are
 * written to survive rather than a live lookup that would break.
 */
export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    type: activityTypeEnum('type').notNull(),
    summary: text('summary').notNull(),
    subjectType: activitySubjectTypeEnum('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    /** Free text until authentication lands; then a user id. */
    actor: text('actor'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Every read is scoped by project, and the feed is read newest first.
    index('activities_project_created_idx').on(table.projectId, table.createdAt),
    // A contextual workspace reads activity about one subject.
    index('activities_project_subject_idx').on(table.projectId, table.subjectId),
  ],
);

export type ActivityRow = typeof activities.$inferSelect;
export type NewActivityRow = typeof activities.$inferInsert;
