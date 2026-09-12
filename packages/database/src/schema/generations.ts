import {
  GENERATION_STATUSES,
  type GenerationAttempt,
  type GenerationFailure,
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
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { projects } from './projects';

export const generationStatusEnum = pgEnum('generation_status', GENERATION_STATUSES);

/**
 * One AI generation: what was asked for, who answered, and what came out.
 *
 * Generations are not entities and not assets. Outputs are `assets` rows, so a
 * generated image is reusable wherever a file is, and this table is what
 * explains it — provider, model, prompt, parameters, inputs and the project
 * context that influenced it.
 *
 * The id columns are arrays rather than a join table: a provenance record is
 * read as a whole, so keeping it in one row means one query answers "how was
 * this made". Lineage *between entities* is not duplicated here — `complete`
 * writes ordinary `generated_from` rows in `entity_relationships`.
 *
 * `parent_generation_id` is `ON DELETE RESTRICT`, like a version's parent: a
 * generation something was re-rolled from cannot be removed from under it.
 * Deleting a whole project still works, because the cascade clears the table
 * first.
 */
export const generations = pgTable(
  'generations',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /**
     * The AI capability requested (`image.generate`, ...). Text rather than an
     * enum: the vocabulary is `@level-zero/ai`'s, which depends on the domain
     * and so cannot be depended on from here, and it grows with each provider
     * adapter. The API validates it against `AI_CAPABILITIES`.
     */
    capability: text('capability').notNull(),
    provider: text('provider'),
    model: text('model'),
    prompt: text('prompt').notNull(),
    parameters: jsonb('parameters').$type<Record<string, unknown>>().notNull().default({}),
    status: generationStatusEnum('status').notNull().default('queued'),
    inputEntityIds: uuid('input_entity_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    inputAssetIds: uuid('input_asset_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    contextEntityIds: uuid('context_entity_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    /**
     * The assembled project context as it was sent to the provider. Null for a
     * caller that named its inputs itself rather than resolving a context.
     */
    resolvedContext: jsonb('resolved_context').$type<Record<string, unknown>>(),
    outputAssetIds: uuid('output_asset_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    // Self-reference via a lazy callback: `generations` is still being assigned
    // when this column definition runs, so the return type is annotated
    // explicitly to break drizzle's (and TypeScript's) inference cycle.
    parentGenerationId: uuid('parent_generation_id').references((): AnyPgColumn => generations.id, {
      onDelete: 'restrict',
    }),
    seed: text('seed'),
    providerRequestId: text('provider_request_id'),
    failure: jsonb('failure').$type<GenerationFailure>(),
    /**
     * Every provider candidate tried before a terminal failure, and why each
     * one failed. Empty unless the whole capability was exhausted — the case
     * that also clears `provider`/`model` above, so this is the only place
     * their vendor detail survives on a failed row.
     */
    attempts: jsonb('attempts')
      .$type<GenerationAttempt[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Free text until authentication lands; then a user id. */
    createdBy: text('created_by'),
  },
  (table) => [
    // Every read is scoped by project, so every index leads with it.
    index('generations_project_idx').on(table.projectId),
    index('generations_project_status_idx').on(table.projectId, table.status),
    index('generations_project_created_at_idx').on(table.projectId, table.createdAt),
    index('generations_parent_idx').on(table.parentGenerationId),
    // Provenance is read backwards from an output asset or a project entity,
    // which is a containment test over an array.
    index('generations_output_assets_idx').using('gin', table.outputAssetIds),
    index('generations_input_entities_idx').using('gin', table.inputEntityIds),
    index('generations_context_entities_idx').using('gin', table.contextEntityIds),
    check(
      'generations_terminal_completed_at',
      sql`(${table.status} in ('complete', 'failed', 'cancelled')) = (${table.completedAt} is not null)`,
    ),
    // A failed generation always carries its diagnostics, and nothing else does.
    check(
      'generations_failure_consistency',
      sql`(${table.status} = 'failed') = (${table.failure} is not null)`,
    ),
  ],
);

export type GenerationRow = typeof generations.$inferSelect;
export type NewGenerationRow = typeof generations.$inferInsert;
