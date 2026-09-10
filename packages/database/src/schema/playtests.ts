import { PLAYTEST_SENTIMENTS, PLAYTEST_STATUSES } from '@level-zero/domain';
import { sql } from 'drizzle-orm';
import {
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { entities } from './entities';
import { projects } from './projects';
import { prototypeVersions } from './prototype-versions';

export const playtestStatusEnum = pgEnum('playtest_status', PLAYTEST_STATUSES);
export const playtestSentimentEnum = pgEnum('playtest_sentiment', PLAYTEST_SENTIMENTS);

/**
 * A playtest: evidence about one exact `PrototypeVersion`, not a game object
 * (`docs/decisions/playtest-record-model.md` §3.1). There is no
 * `prototype_id` column — it is derivable through `prototype_version_id`, and
 * duplicating it would duplicate entity identity (§5.3).
 *
 * `prototype_version_id` carries a composite foreign key onto
 * `prototype_versions(id, project_id)`, `ON DELETE RESTRICT`, reusing the
 * unique key that table already exposes for exactly this. That is what makes
 * the historical-integrity guarantee a database constraint rather than a
 * service-layer convention (§5.1): a playtest cannot name another project's
 * version, and a version a playtest cites cannot be deleted. Deleting a whole
 * project still works, because the cascade from `project_id` clears these
 * rows first.
 */
export const playtests = pgTable(
  'playtests',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    prototypeVersionId: uuid('prototype_version_id').notNull(),
    name: text('name').notNull(),
    /** Short plain text, not `RichTextEditor` content (§9.1). */
    goal: text('goal'),
    status: playtestStatusEnum('status').notNull().default('planned'),
    summary: text('summary'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Free text until authentication lands; then a user id. */
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.prototypeVersionId, table.projectId],
      foreignColumns: [prototypeVersions.id, prototypeVersions.projectId],
      name: 'playtests_prototype_version_fk',
    }).onDelete('restrict'),
    // Lets a session carry a composite foreign key pinning it to one project
    // as well as one playtest.
    unique('playtests_id_project_id_key').on(table.id, table.projectId),
    index('playtests_project_idx').on(table.projectId, table.createdAt),
    index('playtests_prototype_version_idx').on(table.prototypeVersionId),
    index('playtests_tags_idx').using('gin', table.tags),
  ],
);

/**
 * One concrete run within a playtest. No life outside its parent and nothing
 * to version (§3.2), so it is a plain child row rather than an annotated one.
 */
export const playtestSessions = pgTable(
  'playtest_sessions',
  {
    id: uuid('id').primaryKey(),
    // Its own cascade to the project, like `prototype_entity_versions` has:
    // it is what lets a whole project be deleted, by clearing these rows
    // before anything that restricts on them.
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    playtestId: uuid('playtest_id').notNull(),
    sessionNumber: integer('session_number').notNull(),
    /** A participant is not a user account, so this is free text. */
    participant: text('participant'),
    notes: text('notes'),
    /** Both nullable: a session may be logged after the fact. */
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.playtestId, table.projectId],
      foreignColumns: [playtests.id, playtests.projectId],
      name: 'playtest_sessions_playtest_fk',
    }).onDelete('cascade'),
    // Keeps per-playtest numbering monotonic under concurrent recording: a
    // racing second insert fails rather than reusing a number.
    unique('playtest_sessions_playtest_number_key').on(table.playtestId, table.sessionNumber),
    // Lets the layer below carry a composite foreign key pinning it to one
    // project as well as to one session (§5.4).
    unique('playtest_sessions_id_project_id_key').on(table.id, table.projectId),
    unique('playtest_sessions_id_playtest_id_key').on(table.id, table.playtestId),
    index('playtest_sessions_project_idx').on(table.projectId, table.playtestId),
  ],
);

/**
 * A moment the team noticed during a playtest — their interpretation, not the
 * participant's own words (that's `playtest_feedback`; §8.3 keeps the two
 * apart because their authorship differs).
 *
 * `entity_id` narrows an observation to one thing in the game. It is not an
 * `EntityRelationship`, because an observation is not itself an entity —
 * a single nullable reference is the right shape here (§9.2).
 */
export const playtestObservations = pgTable(
  'playtest_observations',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    playtestId: uuid('playtest_id').notNull(),
    /** The run this was noticed in, or null for a whole-playtest note. */
    sessionId: uuid('session_id'),
    /** The entity this narrows to, e.g. "the diver got stuck at the trench". */
    entityId: uuid('entity_id'),
    /** Offset into the session, where one is known. */
    atSeconds: integer('at_seconds'),
    body: text('body').notNull(),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    observedBy: text('observed_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.playtestId, table.projectId],
      foreignColumns: [playtests.id, playtests.projectId],
      name: 'playtest_observations_playtest_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.sessionId, table.playtestId],
      foreignColumns: [playtestSessions.id, playtestSessions.playtestId],
      name: 'playtest_observations_session_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.entityId, table.projectId],
      foreignColumns: [entities.id, entities.projectId],
      name: 'playtest_observations_entity_fk',
    }).onDelete('restrict'),
    index('playtest_observations_project_idx').on(table.projectId, table.playtestId),
    index('playtest_observations_session_idx').on(table.sessionId, table.atSeconds),
    // "Which playtests observed this entity?" is read from the entity.
    index('playtest_observations_entity_idx').on(table.entityId),
    index('playtest_observations_tags_idx').using('gin', table.tags),
  ],
);

/**
 * A participant's own words, stored verbatim — not the team's interpretation
 * (that's `playtest_observations`; §8.3). No entity link: #63 describes
 * feedback as participant prose grouped by theme, not by the entity it
 * concerns.
 */
export const playtestFeedback = pgTable(
  'playtest_feedback',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    playtestId: uuid('playtest_id').notNull(),
    sessionId: uuid('session_id'),
    body: text('body').notNull(),
    /** A three-way judgment, not a vocabulary — kept small on purpose. */
    sentiment: playtestSentimentEnum('sentiment'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Who said it, where known. */
    author: text('author'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.playtestId, table.projectId],
      foreignColumns: [playtests.id, playtests.projectId],
      name: 'playtest_feedback_playtest_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.sessionId, table.playtestId],
      foreignColumns: [playtestSessions.id, playtestSessions.playtestId],
      name: 'playtest_feedback_session_fk',
    }).onDelete('cascade'),
    index('playtest_feedback_project_idx').on(table.projectId, table.playtestId),
    index('playtest_feedback_session_idx').on(table.sessionId),
    index('playtest_feedback_tags_idx').using('gin', table.tags),
  ],
);

/**
 * One measurement recorded during or about a playtest. Deliberately not a
 * `Parameter` (§7) and carries no `parameter_id`: a metric is a number with a
 * unit, and correlating it with a tuning parameter is #65's job, not a
 * relationship this row declares.
 *
 * `session_id` set means a per-run measurement; null means a playtest-level
 * figure. The unique key is `NULLS NOT DISTINCT` so playtest-level rows
 * (`session_id IS NULL`) are covered by "one value per key per run" too —
 * Postgres otherwise treats every `NULL` as distinct in a unique constraint.
 */
export const playtestMetrics = pgTable(
  'playtest_metrics',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    playtestId: uuid('playtest_id').notNull(),
    sessionId: uuid('session_id'),
    /** Stable identity, minted from `label` by `resolvePlaytestMetricKey`. */
    metricKey: text('metric_key').notNull(),
    /** As entered; `metricKey` is the identity. */
    label: text('label').notNull(),
    value: doublePrecision('value').notNull(),
    /** `s`, `%`, `m/s`, ... — same convention as `Parameter.units`. */
    unit: text('unit'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.playtestId, table.projectId],
      foreignColumns: [playtests.id, playtests.projectId],
      name: 'playtest_metrics_playtest_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.sessionId, table.playtestId],
      foreignColumns: [playtestSessions.id, playtestSessions.playtestId],
      name: 'playtest_metrics_session_fk',
    }).onDelete('cascade'),
    unique('playtest_metrics_playtest_session_metric_key')
      .on(table.playtestId, table.sessionId, table.metricKey)
      .nullsNotDistinct(),
    index('playtest_metrics_project_idx').on(table.projectId, table.playtestId),
    // #65's cross-version comparison: has a metric changed between two plays.
    index('playtest_metrics_playtest_key_idx').on(table.playtestId, table.metricKey),
  ],
);

export type PlaytestRow = typeof playtests.$inferSelect;
export type NewPlaytestRow = typeof playtests.$inferInsert;
export type PlaytestSessionRow = typeof playtestSessions.$inferSelect;
export type NewPlaytestSessionRow = typeof playtestSessions.$inferInsert;
export type PlaytestObservationRow = typeof playtestObservations.$inferSelect;
export type NewPlaytestObservationRow = typeof playtestObservations.$inferInsert;
export type PlaytestFeedbackRow = typeof playtestFeedback.$inferSelect;
export type NewPlaytestFeedbackRow = typeof playtestFeedback.$inferInsert;
export type PlaytestMetricRow = typeof playtestMetrics.$inferSelect;
export type NewPlaytestMetricRow = typeof playtestMetrics.$inferInsert;
