import { VERSION_REASONS, type EntitySnapshot } from '@level-zero/domain';
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { entities } from './entities';
import { projects } from './projects';

export const versionReasonEnum = pgEnum('entity_version_reason', VERSION_REASONS);

/**
 * Immutable points in an entity's creative history.
 *
 * Rows are only ever inserted. Restore and promote append new versions rather
 * than editing old ones, so later history always survives.
 *
 * `parent_version_id` and `entity_id` are both `ON DELETE RESTRICT`: a version
 * that something descends from cannot be deleted out from under it, and neither
 * can the entity it belongs to. Deleting a whole project still works, because
 * the cascade clears the versions first.
 */
export const entityVersions = pgTable(
  'entity_versions',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    parentVersionId: uuid('parent_version_id'),
    branchName: text('branch_name').notNull().default('main'),
    snapshot: jsonb('snapshot').$type<EntitySnapshot>().notNull(),
    reason: versionReasonEnum('reason').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    /** Free text until authentication lands; then a user id. */
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.entityId, table.projectId],
      foreignColumns: [entities.id, entities.projectId],
      name: 'entity_versions_entity_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.parentVersionId],
      foreignColumns: [table.id],
      name: 'entity_versions_parent_fk',
    }).onDelete('restrict'),
    // Makes the per-entity numbering monotonic even under concurrent commits:
    // a racing second insert fails rather than reusing a number.
    unique('entity_versions_entity_number_key').on(table.entityId, table.versionNumber),
    // Lets a row elsewhere reference a version *and* the entity and project it
    // belongs to in one composite foreign key, which is how prototype members
    // are stopped from pinning another entity's or another project's history.
    unique('entity_versions_identity_key').on(table.id, table.entityId, table.projectId),
    index('entity_versions_project_idx').on(table.projectId),
    index('entity_versions_entity_idx').on(table.entityId, table.versionNumber),
    index('entity_versions_branch_idx').on(table.entityId, table.branchName),
  ],
);

export type EntityVersionRow = typeof entityVersions.$inferSelect;
export type NewEntityVersionRow = typeof entityVersions.$inferInsert;
