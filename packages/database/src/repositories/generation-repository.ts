import {
  NotFoundError,
  type Generation,
  type GenerationListFilter,
  type GenerationPage,
  type GenerationRepository,
} from '@level-zero/domain';
import { and, arrayContains, count, desc, eq, inArray, or, type SQL } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import { generations } from '../schema/generations';
import { toGeneration, toGenerationRow } from './mappers';

/**
 * Postgres adapter for the domain's `GenerationRepository` port.
 *
 * Every statement carries `project_id`, including the ones that look up a row
 * by its primary key, so a mismatched project can never read or write another
 * project's generation. Provenance lookups are array containment tests, served
 * by the GIN indexes on the id columns.
 */
export class DrizzleGenerationRepository implements GenerationRepository {
  constructor(private readonly db: Database) {}

  async insert(generation: Generation): Promise<Generation> {
    const [row] = await this.db.insert(generations).values(toGenerationRow(generation)).returning();
    if (!row) throw new Error('Insert returned no generation row');
    return toGeneration(row);
  }

  async findById(projectId: string, generationId: string): Promise<Generation | null> {
    const [row] = await this.db
      .select()
      .from(generations)
      .where(and(eq(generations.id, generationId), eq(generations.projectId, projectId)))
      .limit(1);

    return row ? toGeneration(row) : null;
  }

  async listByProject(projectId: string, filter: GenerationListFilter): Promise<GenerationPage> {
    const where = buildGenerationWhere(projectId, filter);

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(generations)
        .where(where)
        .orderBy(desc(generations.createdAt), desc(generations.id))
        .limit(filter.limit ?? 50)
        .offset(filter.offset ?? 0),
      this.db.select({ value: count() }).from(generations).where(where),
    ]);

    return { items: rows.map(toGeneration), total: totals?.value ?? 0 };
  }

  async save(generation: Generation): Promise<Generation> {
    const [row] = await this.db
      .update(generations)
      .set(toGenerationRow(generation))
      .where(
        and(eq(generations.id, generation.id), eq(generations.projectId, generation.projectId)),
      )
      .returning();

    if (!row) throw new NotFoundError('Generation', generation.id);
    return toGeneration(row);
  }
}

function buildGenerationWhere(projectId: string, filter: GenerationListFilter): SQL {
  const conditions: SQL[] = [eq(generations.projectId, projectId)];

  if (filter.statuses?.length) {
    conditions.push(inArray(generations.status, [...filter.statuses]));
  }

  if (filter.capability) {
    conditions.push(eq(generations.capability, filter.capability));
  }

  if (filter.parentGenerationId) {
    conditions.push(eq(generations.parentGenerationId, filter.parentGenerationId));
  }

  if (filter.outputAssetId) {
    conditions.push(arrayContains(generations.outputAssetIds, [filter.outputAssetId]));
  }

  // An entity influences a generation either as a named input or as context.
  if (filter.entityId) {
    conditions.push(
      or(
        arrayContains(generations.inputEntityIds, [filter.entityId]),
        arrayContains(generations.contextEntityIds, [filter.entityId]),
      ) as SQL,
    );
  }

  return and(...conditions) as SQL;
}
