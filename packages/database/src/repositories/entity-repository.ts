import {
  ASSET_REFERENCE_ASSET_ID_KEY,
  NotFoundError,
  type Entity,
  type EntityListFilter,
  type EntityPage,
  type EntityRepository,
  type FindOrCreateAssetReferenceResult,
} from '@level-zero/domain';
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import { entities } from '../schema/entities';
import { escapeLikePattern, toEntity, toEntityRow } from './mappers';
import { hasPostgresCode, UNIQUE_VIOLATION } from './postgres-errors';

/**
 * Postgres adapter for the domain's `EntityRepository` port.
 *
 * Every statement carries `project_id`, including the ones that look up a row
 * by its primary key, so a mismatched project can never read or write another
 * project's entity.
 */
export class DrizzleEntityRepository implements EntityRepository {
  constructor(private readonly db: Database) {}

  async insert(entity: Entity): Promise<Entity> {
    const [row] = await this.db.insert(entities).values(toEntityRow(entity)).returning();
    if (!row) throw new Error('Insert returned no entity row');
    return toEntity(row);
  }

  async findById(projectId: string, entityId: string): Promise<Entity | null> {
    const [row] = await this.db
      .select()
      .from(entities)
      .where(and(eq(entities.id, entityId), eq(entities.projectId, projectId)))
      .limit(1);

    return row ? toEntity(row) : null;
  }

  async listByProject(projectId: string, filter: EntityListFilter): Promise<EntityPage> {
    const where = buildEntityWhere(projectId, filter);

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(entities)
        .where(where)
        .orderBy(desc(entities.createdAt), desc(entities.id))
        .limit(filter.limit ?? 50)
        .offset(filter.offset ?? 0),
      this.db.select({ value: count() }).from(entities).where(where),
    ]);

    return { items: rows.map(toEntity), total: totals?.value ?? 0 };
  }

  async save(entity: Entity): Promise<Entity> {
    const [row] = await this.db
      .update(entities)
      .set(toEntityRow(entity))
      .where(and(eq(entities.id, entity.id), eq(entities.projectId, entity.projectId)))
      .returning();

    if (!row) throw new NotFoundError('Entity', entity.id);
    return toEntity(row);
  }

  async findOrCreateAssetReference(
    entity: Entity,
    assetId: string,
  ): Promise<FindOrCreateAssetReferenceResult> {
    try {
      const [row] = await this.db.insert(entities).values(toEntityRow(entity)).returning();
      if (!row) throw new Error('Insert returned no entity row');
      return { entity: toEntity(row), created: true };
    } catch (error) {
      if (!hasPostgresCode(error, UNIQUE_VIOLATION)) throw error;

      // Another request won the race for `entities_asset_reference_asset_id_key`:
      // the constraint that just fired is what guarantees this row exists to find.
      const existing = await this.selectAssetReference(entity.projectId, assetId);
      if (!existing) throw error;
      return { entity: existing, created: false };
    }
  }

  async findAssetReference(projectId: string, assetId: string): Promise<Entity | null> {
    return this.selectAssetReference(projectId, assetId);
  }

  private async selectAssetReference(projectId: string, assetId: string): Promise<Entity | null> {
    const [row] = await this.db
      .select()
      .from(entities)
      .where(
        and(
          eq(entities.projectId, projectId),
          eq(entities.type, 'asset_reference'),
          sql`${entities.data} ->> ${ASSET_REFERENCE_ASSET_ID_KEY} = ${assetId}`,
        ),
      )
      .limit(1);

    return row ? toEntity(row) : null;
  }
}

function buildEntityWhere(projectId: string, filter: EntityListFilter): SQL {
  const conditions: SQL[] = [eq(entities.projectId, projectId)];

  if (filter.statuses?.length) {
    conditions.push(inArray(entities.status, [...filter.statuses]));
  } else if (filter.includeArchived !== true) {
    // Archived entities are kept, not deleted, so they are hidden by default.
    conditions.push(sql`${entities.status} <> 'archived'`);
  }

  if (filter.types?.length) {
    conditions.push(inArray(entities.type, [...filter.types]));
  }

  const tags = filter.tags?.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0);
  if (tags?.length) {
    // Tags keep the casing the user typed, so matching lowercases both sides.
    // The list is joined explicitly: a bare array would be interpolated as a
    // Postgres array literal, which `in (...)` does not accept.
    const wanted = sql.join(
      tags.map((tag) => sql`${tag}`),
      sql`, `,
    );
    conditions.push(
      sql`exists (select 1 from unnest(${entities.tags}) as tag where lower(tag) in (${wanted}))`,
    );
  }

  const search = filter.search?.trim();
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`;
    const matches = or(ilike(entities.name, pattern), ilike(entities.description, pattern));
    if (matches) conditions.push(matches);
  }

  return and(...conditions) as SQL;
}
