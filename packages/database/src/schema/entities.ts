import { ENTITY_STATUSES, ENTITY_TYPES } from '@level-zero/domain';
import { sql } from 'drizzle-orm';
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects';

export const entityTypeEnum = pgEnum('entity_type', ENTITY_TYPES);
export const entityStatusEnum = pgEnum('entity_status', ENTITY_STATUSES);

/**
 * The one table every game object lives in.
 *
 * Type-specific fields go in `data` (JSONB) so an early experiment can change
 * shape without a migration, and so a new tool is a new *view*, not a new
 * store. Assets and generations are separate concepts and are not entities.
 */
export const entities = pgTable(
  'entities',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    type: entityTypeEnum('type').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: entityStatusEnum('status').notNull().default('draft'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    /** Populated by the entity versioning work in issue #4. */
    currentVersionId: uuid('current_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    // Every read is scoped by project, so every index leads with it.
    index('entities_project_idx').on(table.projectId),
    index('entities_project_type_idx').on(table.projectId, table.type),
    index('entities_project_status_idx').on(table.projectId, table.status),
    index('entities_project_created_at_idx').on(table.projectId, table.createdAt),
    index('entities_tags_idx').using('gin', table.tags),
  ],
);

export type EntityRow = typeof entities.$inferSelect;
export type NewEntityRow = typeof entities.$inferInsert;
