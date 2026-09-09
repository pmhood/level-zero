import { PROTOTYPE_VERSION_STATUSES } from '@level-zero/domain';
import {
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { assets } from './assets';
import { entities } from './entities';
import { entityVersions } from './entity-versions';
import { projects } from './projects';

export const prototypeVersionStatusEnum = pgEnum(
  'prototype_version_status',
  PROTOTYPE_VERSION_STATUSES,
);

/**
 * One playable experiment, at one point in its life.
 *
 * The prototype itself is an `entities` row of type `prototype` — this table
 * does not duplicate its identity, only references it. What it adds is the part
 * an entity cannot express: which exact entity *versions* the experiment was
 * built from, in `prototype_entity_versions`.
 *
 * `prototype_id` references the composite `(id, project_id)` key of `entities`,
 * so a version cannot be recorded against another project's entity at all, and
 * the prototype cannot be deleted while it has history.
 *
 * Both references are `ON DELETE RESTRICT`: the prototype cannot be deleted
 * while it has history, and neither can a build artifact something played.
 * Deleting a whole project still works, because the cascade from `project_id`
 * clears these rows first.
 */
export const prototypeVersions = pgTable(
  'prototype_versions',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    prototypeId: uuid('prototype_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    /** Optional label; the number is the identity. */
    name: text('name'),
    status: prototypeVersionStatusEnum('status').notNull().default('draft'),
    notes: text('notes'),
    /** Optional playable build, usually an asset of kind `build_artifact`. */
    buildAssetId: uuid('build_asset_id').references(() => assets.id, { onDelete: 'restrict' }),
    /** Free text until authentication lands; then a user id. */
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.prototypeId, table.projectId],
      foreignColumns: [entities.id, entities.projectId],
      name: 'prototype_versions_prototype_fk',
    }).onDelete('restrict'),
    // Keeps the per-prototype numbering monotonic even under concurrent
    // captures: a racing second insert fails rather than reusing a number.
    unique('prototype_versions_prototype_number_key').on(table.prototypeId, table.versionNumber),
    // Lets the member rows carry a composite foreign key that pins them to
    // one project as well as one prototype version.
    unique('prototype_versions_id_project_id_key').on(table.id, table.projectId),
    index('prototype_versions_project_idx').on(table.projectId),
    index('prototype_versions_prototype_idx').on(table.prototypeId, table.versionNumber),
    index('prototype_versions_build_asset_idx').on(table.buildAssetId),
  ],
);

/**
 * The exact entity versions one prototype version is made of.
 *
 * `entity_version_id` references the composite `(id, entity_id, project_id)`
 * key of `entity_versions`, `ON DELETE RESTRICT`, which is what makes
 * historical integrity a database guarantee rather than a convention: a pinned
 * version cannot be deleted, cannot belong to another entity, and cannot come
 * from another project.
 *
 * The primary key is `(prototype_version_id, entity_id)`, so an entity can
 * appear at most once in a version — there is no sensible winner between two
 * versions of the same character in one prototype.
 */
export const prototypeEntityVersions = pgTable(
  'prototype_entity_versions',
  {
    prototypeVersionId: uuid('prototype_version_id').notNull(),
    // Its own cascade to the project, like `entity_relationships` has: it is
    // what lets a whole project be deleted, by clearing these rows before the
    // entity versions they restrict.
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id').notNull(),
    entityVersionId: uuid('entity_version_id').notNull(),
    /** Preserves the order the versions were recorded in. */
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.prototypeVersionId, table.entityId] }),
    foreignKey({
      columns: [table.prototypeVersionId, table.projectId],
      foreignColumns: [prototypeVersions.id, prototypeVersions.projectId],
      name: 'prototype_entity_versions_prototype_version_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.entityVersionId, table.entityId, table.projectId],
      foreignColumns: [entityVersions.id, entityVersions.entityId, entityVersions.projectId],
      name: 'prototype_entity_versions_entity_version_fk',
    }).onDelete('restrict'),
    index('prototype_entity_versions_project_idx').on(table.projectId),
    // "Which prototypes included this version?" is read from the version.
    index('prototype_entity_versions_entity_version_idx').on(table.entityVersionId),
  ],
);

export type PrototypeVersionRow = typeof prototypeVersions.$inferSelect;
export type NewPrototypeVersionRow = typeof prototypeVersions.$inferInsert;
export type PrototypeEntityVersionRow = typeof prototypeEntityVersions.$inferSelect;
export type NewPrototypeEntityVersionRow = typeof prototypeEntityVersions.$inferInsert;
