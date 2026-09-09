import { MOODBOARD_NODE_TYPES } from '@level-zero/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
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
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { assets } from './assets';
import { entities } from './entities';
import { entityRelationships } from './entity-relationships';
import { projects } from './projects';

export const moodboardNodeTypeEnum = pgEnum('moodboard_node_type', MOODBOARD_NODE_TYPES);

/**
 * Where one thing sits on one board.
 *
 * The board itself is an `entities` row of type `moodboard` — this table does
 * not duplicate its identity, only references it. What it adds is the part an
 * entity cannot express: position, size, rotation, order, grouping and lock
 * state, per board rather than per asset.
 *
 * That separation is the whole point. `asset_id` and `entity_id` are plain
 * references, so one asset row can carry two placements on two boards while
 * still being one file in the library, and deleting a placement is a `DELETE`
 * of this row and nothing else. Both are `ON DELETE RESTRICT`, so the reverse
 * is a database guarantee too: nothing a board is showing can be deleted out
 * from under it. Deleting a whole project still works, because the cascade
 * from `project_id` clears these rows first.
 *
 * A check constraint keeps the reference honest — an `asset` node has an asset
 * and nothing else, a `text` node has neither — so a board cannot claim an
 * asset through a node type that is not supposed to have one.
 */
export const moodboardNodes = pgTable(
  'moodboard_nodes',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    boardId: uuid('board_id').notNull(),
    type: moodboardNodeTypeEnum('type').notNull(),
    /** The asset shown, for an `asset` node. Never a copy of it. */
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'restrict' }),
    /** The canonical entity shown, for an `entity` node. */
    entityId: uuid('entity_id'),
    // Self-reference via a lazy callback, like `assets.source_asset_id`:
    // `moodboardNodes` is still being assigned while this column is defined.
    // Deleting a group ungroups its members rather than deleting them.
    groupId: uuid('group_id').references((): AnyPgColumn => moodboardNodes.id, {
      onDelete: 'set null',
    }),
    x: doublePrecision('x').notNull().default(0),
    y: doublePrecision('y').notNull().default(0),
    width: doublePrecision('width').notNull(),
    height: doublePrecision('height').notNull(),
    /** Clockwise, in radians. */
    rotation: doublePrecision('rotation').notNull().default(0),
    /** Back-to-front order within the board. */
    zOrder: integer('z_order').notNull().default(0),
    locked: boolean('locked').notNull().default(false),
    /** Node-kind content: the text, the palette's colours, the link's URL. */
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.boardId, table.projectId],
      foreignColumns: [entities.id, entities.projectId],
      name: 'moodboard_nodes_board_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.entityId, table.projectId],
      foreignColumns: [entities.id, entities.projectId],
      name: 'moodboard_nodes_entity_fk',
    }).onDelete('restrict'),
    // Lets a connector carry a composite foreign key pinning it to one project
    // as well as to one node.
    unique('moodboard_nodes_id_project_id_key').on(table.id, table.projectId),
    check(
      'moodboard_nodes_reference_consistency',
      sql`(${table.type} = 'asset') = (${table.assetId} IS NOT NULL) AND (${table.type} = 'entity') = (${table.entityId} IS NOT NULL)`,
    ),
    check('moodboard_nodes_positive_size', sql`${table.width} > 0 AND ${table.height} > 0`),
    index('moodboard_nodes_project_idx').on(table.projectId),
    index('moodboard_nodes_board_idx').on(table.boardId, table.zOrder),
    // "Which boards is this on?" is read from the asset or the entity.
    index('moodboard_nodes_asset_idx').on(table.assetId),
    index('moodboard_nodes_entity_idx').on(table.entityId),
    index('moodboard_nodes_group_idx').on(table.groupId),
  ],
);

/**
 * A line drawn between two nodes on one board.
 *
 * A connector is an annotation, not a claim about the project: it lives here,
 * beside the layout, and never in `entity_relationships`. `relationship_id` is
 * null until someone explicitly promotes the line into a real edge, and is
 * `ON DELETE SET NULL` so unlinking that edge leaves the line untouched.
 *
 * Both endpoints are referenced by `(id, project_id)`, so a connector joining
 * two projects cannot be written at all, and both cascade: erasing a node
 * erases the lines that pointed at it.
 */
export const moodboardConnectors = pgTable(
  'moodboard_connectors',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    boardId: uuid('board_id').notNull(),
    fromNodeId: uuid('from_node_id').notNull(),
    toNodeId: uuid('to_node_id').notNull(),
    /** What the line means, in the author's words. */
    label: text('label'),
    /** The edge this connector was promoted into, or null while it is a line. */
    relationshipId: uuid('relationship_id').references(() => entityRelationships.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.boardId, table.projectId],
      foreignColumns: [entities.id, entities.projectId],
      name: 'moodboard_connectors_board_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.fromNodeId, table.projectId],
      foreignColumns: [moodboardNodes.id, moodboardNodes.projectId],
      name: 'moodboard_connectors_from_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.toNodeId, table.projectId],
      foreignColumns: [moodboardNodes.id, moodboardNodes.projectId],
      name: 'moodboard_connectors_to_fk',
    }).onDelete('cascade'),
    check('moodboard_connectors_no_self_link', sql`${table.fromNodeId} <> ${table.toNodeId}`),
    index('moodboard_connectors_project_idx').on(table.projectId),
    index('moodboard_connectors_board_idx').on(table.boardId),
    index('moodboard_connectors_from_idx').on(table.fromNodeId),
    index('moodboard_connectors_to_idx').on(table.toNodeId),
  ],
);

export type MoodboardNodeRow = typeof moodboardNodes.$inferSelect;
export type NewMoodboardNodeRow = typeof moodboardNodes.$inferInsert;
export type MoodboardConnectorRow = typeof moodboardConnectors.$inferSelect;
export type NewMoodboardConnectorRow = typeof moodboardConnectors.$inferInsert;
