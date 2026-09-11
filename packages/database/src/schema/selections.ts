import { ASSET_MARK_KINDS, ASSET_SELECTION_STATES } from '@level-zero/domain';
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
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { assets } from './assets';
import { entities } from './entities';
import { projects } from './projects';

export const assetSelectionStateEnum = pgEnum('asset_selection_state', ASSET_SELECTION_STATES);
export const assetMarkKindEnum = pgEnum('asset_mark_kind', ASSET_MARK_KINDS);

/**
 * Which assets a project chose, and what it chose them for.
 *
 * Rows are only ever inserted, the same shape as `review_decisions` and
 * `entity_versions`: what is current is read back out of the history by
 * `currentAssetSelections`, so an approval is never overwritten and a rejected
 * concept is never removed. Nothing here writes to `assets`, so the file, its
 * status and the `generations` row that produced it are untouched by every
 * state in this table — rejection is an opinion recorded beside a file, not a
 * deletion of it.
 *
 * `(context_entity_id, purpose)` is the answer to "approved for what?". The
 * entity reference is composite against `(id, project_id)` and `ON DELETE
 * RESTRICT`, like every other edge into `entities`, so a selection cannot name
 * another project's character and the character it does name cannot be deleted
 * out from under the decision. `purpose` is a plain label the calling surface
 * owns, stored and matched exactly, exactly as `comments.target_anchor` is.
 *
 * `asset_id` is a single-column reference like `moodboard_nodes.asset_id`,
 * because `assets` has no `(id, project_id)` key to hang a composite one on;
 * project scoping on the read path is what keeps the pair honest.
 */
export const assetSelections = pgTable(
  'asset_selections',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    /** The entity the asset was chosen for: a character, a location, a board. */
    contextEntityId: uuid('context_entity_id').notNull(),
    /** What it was chosen *as* — `portrait`, `costume`. The caller's vocabulary. */
    purpose: text('purpose').notNull(),
    state: assetSelectionStateEnum('state').notNull(),
    /** Free text until authentication lands; then a user id. Never null: a choice is somebody's. */
    actor: text('actor').notNull(),
    note: text('note'),
    // Self-reference via a lazy callback, like `assets.source_asset_id`:
    // `assetSelections` is still being assigned while this column is defined.
    // The approval a supersession points at cannot be deleted, and there is
    // nothing that deletes one anyway.
    supersededBySelectionId: uuid('superseded_by_selection_id').references(
      (): AnyPgColumn => assetSelections.id,
      { onDelete: 'restrict' },
    ),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.contextEntityId, table.projectId],
      foreignColumns: [entities.id, entities.projectId],
      name: 'asset_selections_context_entity_fk',
    }).onDelete('restrict'),
    // Every read is scoped by project; a context's history is read newest first.
    index('asset_selections_project_context_idx').on(
      table.projectId,
      table.contextEntityId,
      table.purpose,
      table.decidedAt,
    ),
    // "What was ever decided about this file?", for provenance and triage grids.
    index('asset_selections_project_asset_idx').on(table.projectId, table.assetId, table.decidedAt),
    // Only a supersession names a replacement, and a supersession always does:
    // clearing an approval without saying what took over is the thing this
    // table exists to prevent.
    check(
      'asset_selections_supersession_names_its_replacement',
      sql`(${table.state} = 'superseded') = (${table.supersededBySelectionId} is not null)`,
    ),
    check('asset_selections_purpose_not_blank', sql`length(trim(${table.purpose})) > 0`),
  ],
);

/**
 * The assets somebody set aside while triaging.
 *
 * A set rather than a history, which is the whole reason this is not a state in
 * `asset_selections`: a star is added and removed freely, carries no context,
 * and nobody needs the record of an unstarring. The unique constraint is what
 * makes marking idempotent — a second click inserts nothing rather than
 * stacking rows — and `favorite` and `shortlisted` are independent, so an asset
 * can carry one, both or neither.
 */
export const assetMarks = pgTable(
  'asset_marks',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    kind: assetMarkKindEnum('kind').notNull(),
    /** Who put it there. Free text until authentication lands; then a user id. */
    actor: text('actor').notNull(),
    markedAt: timestamp('marked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One mark of each kind per asset, per project: what makes `add` idempotent.
    unique('asset_marks_project_asset_kind_key').on(table.projectId, table.assetId, table.kind),
    // "Show me the shortlist", scoped by project like every other read.
    index('asset_marks_project_kind_idx').on(table.projectId, table.kind, table.markedAt),
  ],
);

export type AssetSelectionRow = typeof assetSelections.$inferSelect;
export type NewAssetSelectionRow = typeof assetSelections.$inferInsert;
export type AssetMarkRow = typeof assetMarks.$inferSelect;
export type NewAssetMarkRow = typeof assetMarks.$inferInsert;
