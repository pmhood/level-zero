import { JOB_KINDS, JOB_STATUSES, type JobFailure } from '@level-zero/domain';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { projects } from './projects';

export const jobStatusEnum = pgEnum('job_status', JOB_STATUSES);
export const jobKindEnum = pgEnum('job_kind', JOB_KINDS);

/**
 * One unit of long-running background work.
 *
 * This table, not Redis, is the state. The queue carries a job's identity and
 * nothing else, so a browser reconnecting after a refresh and a worker starting
 * a second attempt both read the same row, and a queue that is flushed loses
 * throughput rather than history.
 *
 * `target_id` names the record the job acts on and has no foreign key on
 * purpose: which table it points at is decided by `kind`, and a job outlives
 * nothing — the project cascade is what cleans it up.
 *
 * Progress is three plain columns rather than a JSON document because a check
 * constraint has to be able to see it: a job can never report more steps done
 * than it has.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: jobKindEnum('kind').notNull(),
    targetId: uuid('target_id').notNull(),
    status: jobStatusEnum('status').notNull().default('queued'),
    progressCompleted: integer('progress_completed').notNull().default(0),
    progressTotal: integer('progress_total').notNull().default(1),
    /** What the job is doing right now, shown to the user verbatim. */
    progressStep: text('progress_step'),
    attempt: integer('attempt').notNull().default(1),
    maxAttempts: integer('max_attempts').notNull().default(3),
    /** The most recent failure, kept while a job waits for its next attempt. */
    failure: jsonb('failure').$type<JobFailure>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    // Every read is scoped by project, so every index leads with it.
    index('jobs_project_idx').on(table.projectId),
    index('jobs_project_status_idx').on(table.projectId, table.status),
    index('jobs_project_created_at_idx').on(table.projectId, table.createdAt),
    // "Which job is running this generation?" is the lookup a UI makes on load.
    index('jobs_project_target_idx').on(table.projectId, table.kind, table.targetId),
    check(
      'jobs_terminal_completed_at',
      sql`(${table.status} in ('complete', 'failed', 'cancelled')) = (${table.completedAt} is not null)`,
    ),
    check(
      'jobs_progress_bounds',
      sql`${table.progressTotal} >= 1 and ${table.progressCompleted} between 0 and ${table.progressTotal}`,
    ),
    // A retried job keeps its last failure while it waits, so a failure is not
    // tied to the failed status the way a generation's is.
    check(
      'jobs_attempt_bounds',
      sql`${table.maxAttempts} >= 1 and ${table.attempt} between 1 and ${table.maxAttempts}`,
    ),
  ],
);

export type JobRow = typeof jobs.$inferSelect;
export type NewJobRow = typeof jobs.$inferInsert;
