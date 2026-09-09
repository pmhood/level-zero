import { SEARCH_SOURCE_TYPES } from '@level-zero/domain';
import { sql } from 'drizzle-orm';
import {
  customType,
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { entityTypeEnum } from './entities';
import { projects } from './projects';

export const searchSourceTypeEnum = pgEnum('search_source_type', SEARCH_SOURCE_TYPES);

/** Postgres' full-text type. Drizzle has no built-in for it. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
});

/**
 * The searchable copy of one canonical record: an entity, an asset or a
 * generation.
 *
 * This table holds no creative content of its own — every row can be rebuilt
 * from the record it mirrors — which is why a search document is not an
 * `Entity`. `source_type` plus `source_id` names that record and
 * `source_version_id` says which version was indexed, so a hit always leads
 * back to something canonical.
 *
 * `source_id` has no foreign key, for the same reason `jobs.target_id` has
 * none: which table it points at is decided by `source_type`. The project
 * cascade is what clears the table.
 *
 * Two ways of asking share the row. `search_vector` is a generated column, so
 * the text a keyword query matches is derived from `title` and `body` by
 * Postgres and can never drift from them; `embedding` answers the questions
 * the words do not, and is built by the `search_index` job rather than on the
 * write path.
 *
 * The vector is a `double precision[]` rather than pgvector's `vector`, because
 * `postgres:16-alpine` does not carry the extension. Every vector is unit
 * length, so similarity is a plain dot product; moving to pgvector later is a
 * column type and an ANN index, not a change to how any of this is used.
 */
export const searchDocuments = pgTable(
  'search_documents',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sourceType: searchSourceTypeEnum('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    /** The entity's type, for entity rows. Null for assets and generations. */
    entityType: entityTypeEnum('entity_type'),
    /** The source's own status, so archived material can be filtered out. */
    status: text('status').notNull(),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    /** Derived by Postgres: the title outranks the body, and neither can drift. */
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(body, '')), 'B')`,
    ),
    /** Fingerprint of the indexed text; the vector is stale when it has moved on. */
    contentHash: text('content_hash').notNull(),
    embedding: doublePrecision('embedding').array(),
    embeddingModel: text('embedding_model'),
    /** The `content_hash` the stored embedding was built from. */
    embeddedHash: text('embedded_hash'),
    sourceVersionId: uuid('source_version_id'),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }).notNull(),
    indexedAt: timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Every read is scoped by project, so every index leads with it.
    index('search_documents_project_idx').on(table.projectId),
    index('search_documents_project_source_type_idx').on(table.projectId, table.sourceType),
    index('search_documents_project_updated_at_idx').on(table.projectId, table.sourceUpdatedAt),
    index('search_documents_vector_idx').using('gin', table.searchVector),
    index('search_documents_tags_idx').using('gin', table.tags),
    // One searchable copy per canonical record: re-indexing is an upsert on it.
    unique('search_documents_source_key').on(table.sourceType, table.sourceId),
  ],
);

export type SearchDocumentRow = typeof searchDocuments.$inferSelect;
export type NewSearchDocumentRow = typeof searchDocuments.$inferInsert;
