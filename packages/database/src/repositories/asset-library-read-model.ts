import {
  pickNewestOrigin,
  type AssetLibraryFilter,
  type AssetLibraryPage,
  type AssetLibraryReadModel,
  type AssetSummary,
} from '@level-zero/domain';
import { and, arrayOverlaps, count, eq, sql, type SQL } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import { assets } from '../schema/assets';
import { generations } from '../schema/generations';
import { buildAssetOrderBy, buildAssetWhere } from './asset-repository';
import { toAsset } from './mappers';

/**
 * Correlated existence check for "some generation in this project lists this
 * asset as an output".
 *
 * `@>` (contains) is one of the operators the GIN `array_ops` opclass
 * indexes, so this rides `generations_output_assets_idx` rather than needing
 * an index of its own. `= any(...)` looks equivalent but is a
 * `ScalarArrayOpExpr`, which that opclass does not support — it planned as a
 * sequential scan of every generation in the project, once per asset row.
 */
const isGenerated = sql`exists (
  select 1 from ${generations}
  where ${generations.projectId} = ${assets.projectId}
    and ${generations.outputAssetIds} @> array[${assets.id}]::uuid[]
)`;

/**
 * Postgres adapter for the asset library's read model.
 *
 * Follows `DrizzleAssetRepository`'s shape: one `where` builder shared
 * between the page query and the count, every statement carrying
 * `project_id`. The origin facet adds exactly one extra statement to the
 * page — a single query for every generation whose outputs overlap the
 * page's asset ids — so the query count is fixed regardless of how many
 * assets are on the page, not one lookup per asset.
 */
export class DrizzleAssetLibraryReadModel implements AssetLibraryReadModel {
  constructor(private readonly db: Database) {}

  async listByProject(projectId: string, filter: AssetLibraryFilter): Promise<AssetLibraryPage> {
    const where = buildLibraryWhere(projectId, filter);

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(assets)
        .where(where)
        .orderBy(...buildAssetOrderBy(filter))
        .limit(filter.limit ?? 50)
        .offset(filter.offset ?? 0),
      this.db.select({ value: count() }).from(assets).where(where),
    ]);

    const origins = await this.originsFor(
      projectId,
      rows.map((row) => row.id),
    );

    return {
      items: rows.map(toAsset),
      summaries: rows.map((row) => origins.get(row.id) ?? importedSummary(row.id)),
      total: totals?.value ?? 0,
    };
  }

  /**
   * One query for the whole page, not one per asset: every generation in the
   * project whose outputs overlap the page's asset ids. An asset produced by
   * more than one generation reports the most recently created one, tying on
   * id — the same tiebreak every other listing here uses.
   */
  private async originsFor(
    projectId: string,
    assetIds: string[],
  ): Promise<Map<string, AssetSummary>> {
    const summaries = new Map<string, AssetSummary>();
    if (assetIds.length === 0) return summaries;

    const candidates = await this.db
      .select({
        id: generations.id,
        capability: generations.capability,
        provider: generations.provider,
        model: generations.model,
        outputAssetIds: generations.outputAssetIds,
        createdAt: generations.createdAt,
      })
      .from(generations)
      .where(
        and(
          eq(generations.projectId, projectId),
          arrayOverlaps(generations.outputAssetIds, assetIds),
        ),
      );

    for (const assetId of assetIds) {
      const matches = candidates.filter((candidate) => candidate.outputAssetIds.includes(assetId));
      const winner = pickNewestOrigin(matches);

      summaries.set(
        assetId,
        winner
          ? {
              assetId,
              origin: 'generated',
              generation: {
                generationId: winner.id,
                capability: winner.capability,
                provider: winner.provider,
                model: winner.model,
              },
            }
          : importedSummary(assetId),
      );
    }

    return summaries;
  }
}

function importedSummary(assetId: string): AssetSummary {
  return { assetId, origin: 'imported', generation: null };
}

/** Exported so a test can assert the origin filter compiles to an index-friendly plan. */
export function buildLibraryWhere(projectId: string, filter: AssetLibraryFilter): SQL {
  const conditions: SQL[] = [buildAssetWhere(projectId, filter)];

  if (filter.origin === 'generated') {
    conditions.push(isGenerated);
  } else if (filter.origin === 'imported') {
    conditions.push(sql`not (${isGenerated})`);
  }

  return and(...conditions) as SQL;
}
