import {
  ASSET_KINDS,
  ASSET_PIPELINE_STAGES,
  ASSET_STATUSES,
  ASSET_VARIANTS,
} from '@level-zero/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { projects } from './projects';

export const assetKindEnum = pgEnum('asset_kind', ASSET_KINDS);
export const assetVariantEnum = pgEnum('asset_variant', ASSET_VARIANTS);
export const assetStatusEnum = pgEnum('asset_status', ASSET_STATUSES);
export const assetPipelineStageEnum = pgEnum('asset_pipeline_stage', ASSET_PIPELINE_STAGES);

/**
 * A reusable, project-scoped file: an image, a video, an audio clip, a 3D
 * file, a reference, an export, or a build artifact.
 *
 * `storage_key` points into whichever `ObjectStorageProvider` is configured;
 * it is never a provider URL, so switching providers never rewrites this
 * table. Assets are not entities and have no feature-specific foreign keys —
 * a tool links to one through an `asset_reference` entity and the
 * relationship graph (see `entity-relationships.ts`).
 */
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: assetKindEnum('kind').notNull(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    storageKey: text('storage_key').notNull(),
    checksum: text('checksum').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationSeconds: doublePrecision('duration_seconds'),
    variant: assetVariantEnum('variant').notNull().default('source'),
    // Self-reference via a lazy callback: `assets` is still being assigned
    // when this column definition runs, so the return type is annotated
    // explicitly to break drizzle's (and TypeScript's) inference cycle.
    sourceAssetId: uuid('source_asset_id').references((): AnyPgColumn => assets.id, {
      onDelete: 'set null',
    }),
    status: assetStatusEnum('status').notNull().default('active'),
    pipelineStage: assetPipelineStageEnum('pipeline_stage').notNull().default('concept'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    /** Free text until authentication lands; then a user id. */
    createdBy: text('created_by'),
  },
  (table) => [
    // Every read is scoped by project, so every index leads with it.
    index('assets_project_idx').on(table.projectId),
    index('assets_project_kind_idx').on(table.projectId, table.kind),
    index('assets_project_status_idx').on(table.projectId, table.status),
    // The strip's per-stage counts and the stage filter both scope by
    // project first, matching every other index here.
    index('assets_project_pipeline_stage_idx').on(table.projectId, table.pipelineStage),
    // Trailing `id` matches the default sort's tiebreak, so paging never
    // drops or repeats a row when two assets share a `created_at`.
    index('assets_project_created_at_idx').on(table.projectId, table.createdAt, table.id),
    index('assets_source_idx').on(table.sourceAssetId),
    check(
      'assets_variant_source_consistency',
      sql`(${table.variant} = 'source' AND ${table.sourceAssetId} IS NULL) OR (${table.variant} <> 'source' AND ${table.sourceAssetId} IS NOT NULL)`,
    ),
  ],
);

export type AssetRow = typeof assets.$inferSelect;
export type NewAssetRow = typeof assets.$inferInsert;
