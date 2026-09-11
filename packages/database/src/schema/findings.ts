import {
  FINDING_ORIGINS,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  type FindingEvidence,
} from '@level-zero/domain';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { projects } from './projects';

export const findingOriginEnum = pgEnum('finding_origin', FINDING_ORIGINS);
export const findingSeverityEnum = pgEnum('finding_severity', FINDING_SEVERITIES);
export const findingStatusEnum = pgEnum('finding_status', FINDING_STATUSES);

/**
 * One contradiction, as the last scan saw it.
 *
 * This table holds no creative content of its own — `check_id`, `origin`,
 * `generation_id`, `severity`, `summary` and `evidence` are overwritten
 * wholesale by every scan — which is why a finding is not an `Entity`, the
 * same reasoning `search_documents` is built on. The unique key on
 * `(project_id, fingerprint)` is what makes a rescan an upsert rather than a
 * duplicate.
 *
 * `status`, `first_seen_at`, `resolved_at`, `dismissed_at`, `dismissed_by`
 * and `dismissed_reason` are the exception: the user's, and a check has no
 * way to touch them (docs/decisions/consistency-findings.md §3.2, §10).
 *
 * `check_id` and `fingerprint` are text rather than enums: the set of checks
 * grows with each one registered in `CONSISTENCY_CHECKS`, the same reason
 * `generations.capability` is text rather than an enum.
 *
 * `generation_id` carries no foreign key, and neither does an
 * `evidence[].entityId` (kept inside the JSON): a finding must outlive the
 * generation that explained it and the entities it cites, the same reasoning
 * `activities.subject_id` and `jobs.target_id` carry none.
 */
export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    checkId: text('check_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    origin: findingOriginEnum('origin').notNull(),
    /** Non-null exactly when `origin` is `ai_assisted`. No foreign key: see table comment. */
    generationId: uuid('generation_id'),
    severity: findingSeverityEnum('severity').notNull(),
    summary: text('summary').notNull(),
    evidence: jsonb('evidence').$type<FindingEvidence[]>().notNull(),
    status: findingStatusEnum('status').notNull().default('open'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    /** Free text until authentication lands; then a user id. */
    dismissedBy: text('dismissed_by'),
    dismissedReason: text('dismissed_reason'),
  },
  (table) => [
    // Every read is scoped by project, so every index leads with it.
    index('findings_project_idx').on(table.projectId),
    index('findings_project_status_idx').on(table.projectId, table.status),
    // Re-running a check is an upsert on this key, never a new row.
    unique('findings_project_fingerprint_key').on(table.projectId, table.fingerprint),
    check(
      'findings_generation_id_consistency',
      sql`(${table.origin} = 'ai_assisted') = (${table.generationId} is not null)`,
    ),
    check(
      'findings_dismissed_consistency',
      sql`(${table.status} = 'dismissed') = (${table.dismissedAt} is not null and ${table.dismissedBy} is not null)`,
    ),
    check(
      'findings_resolved_consistency',
      sql`(${table.status} = 'resolved') = (${table.resolvedAt} is not null)`,
    ),
  ],
);

export type FindingRow = typeof findings.$inferSelect;
export type NewFindingRow = typeof findings.$inferInsert;
