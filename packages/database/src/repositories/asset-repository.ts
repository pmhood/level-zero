import {
  NotFoundError,
  type Asset,
  type AssetListFilter,
  type AssetPage,
  type AssetRepository,
} from '@level-zero/domain';
import { and, count, desc, eq, ilike, inArray, type SQL } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import { assets } from '../schema/assets';
import { escapeLikePattern, toAsset, toAssetRow } from './mappers';

/**
 * Postgres adapter for the domain's `AssetRepository` port.
 *
 * Every statement carries `project_id`, including the ones that look up a row
 * by its primary key, so a mismatched project can never read or write another
 * project's asset.
 */
export class DrizzleAssetRepository implements AssetRepository {
  constructor(private readonly db: Database) {}

  async insert(asset: Asset): Promise<Asset> {
    const [row] = await this.db.insert(assets).values(toAssetRow(asset)).returning();
    if (!row) throw new Error('Insert returned no asset row');
    return toAsset(row);
  }

  async findById(projectId: string, assetId: string): Promise<Asset | null> {
    const [row] = await this.db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.projectId, projectId)))
      .limit(1);

    return row ? toAsset(row) : null;
  }

  async listByProject(projectId: string, filter: AssetListFilter): Promise<AssetPage> {
    const where = buildAssetWhere(projectId, filter);

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(assets)
        .where(where)
        .orderBy(desc(assets.createdAt), desc(assets.id))
        .limit(filter.limit ?? 50)
        .offset(filter.offset ?? 0),
      this.db.select({ value: count() }).from(assets).where(where),
    ]);

    return { items: rows.map(toAsset), total: totals?.value ?? 0 };
  }

  async save(asset: Asset): Promise<Asset> {
    const [row] = await this.db
      .update(assets)
      .set(toAssetRow(asset))
      .where(and(eq(assets.id, asset.id), eq(assets.projectId, asset.projectId)))
      .returning();

    if (!row) throw new NotFoundError('Asset', asset.id);
    return toAsset(row);
  }
}

function buildAssetWhere(projectId: string, filter: AssetListFilter): SQL {
  const conditions: SQL[] = [eq(assets.projectId, projectId)];

  if (filter.statuses?.length) {
    conditions.push(inArray(assets.status, [...filter.statuses]));
  } else if (filter.includeArchived !== true) {
    // Archived assets are kept, not deleted, so they are hidden by default.
    conditions.push(inArray(assets.status, ['active']));
  }

  if (filter.kinds?.length) {
    conditions.push(inArray(assets.kind, [...filter.kinds]));
  }

  if (filter.variants?.length) {
    conditions.push(inArray(assets.variant, [...filter.variants]));
  }

  if (filter.sourceAssetId) {
    conditions.push(eq(assets.sourceAssetId, filter.sourceAssetId));
  }

  const search = filter.search?.trim();
  if (search) {
    conditions.push(ilike(assets.filename, `%${escapeLikePattern(search)}%`));
  }

  return and(...conditions) as SQL;
}
