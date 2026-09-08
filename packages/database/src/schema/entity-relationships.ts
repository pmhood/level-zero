import { RELATION_TYPES } from '@level-zero/domain';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { entities } from './entities';
import { projects } from './projects';

export const entityRelationEnum = pgEnum('entity_relation', RELATION_TYPES);

/**
 * Directional edges between entities.
 *
 * Two database-level guarantees carry rules the application would otherwise
 * have to remember:
 *
 * 1. Both endpoints are referenced by `(entity_id, project_id)`, so an edge
 *    joining two projects cannot be written at all.
 * 2. Those references are `ON DELETE RESTRICT`, so an entity that lineage
 *    points at cannot be deleted out from under its history. Deleting a whole
 *    project still works: the cascade removes the edges first.
 */
export const entityRelationships = pgTable(
  'entity_relationships',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sourceEntityId: uuid('source_entity_id').notNull(),
    targetEntityId: uuid('target_entity_id').notNull(),
    relation: entityRelationEnum('relation').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.sourceEntityId, table.projectId],
      foreignColumns: [entities.id, entities.projectId],
      name: 'entity_relationships_source_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.targetEntityId, table.projectId],
      foreignColumns: [entities.id, entities.projectId],
      name: 'entity_relationships_target_fk',
    }).onDelete('restrict'),
    unique('entity_relationships_edge_key').on(
      table.sourceEntityId,
      table.targetEntityId,
      table.relation,
    ),
    check(
      'entity_relationships_no_self_link',
      sql`${table.sourceEntityId} <> ${table.targetEntityId}`,
    ),
    index('entity_relationships_project_idx').on(table.projectId),
    index('entity_relationships_source_idx').on(table.sourceEntityId),
    index('entity_relationships_target_idx').on(table.targetEntityId),
    index('entity_relationships_project_relation_idx').on(table.projectId, table.relation),
  ],
);

export type EntityRelationshipRow = typeof entityRelationships.$inferSelect;
export type NewEntityRelationshipRow = typeof entityRelationships.$inferInsert;
