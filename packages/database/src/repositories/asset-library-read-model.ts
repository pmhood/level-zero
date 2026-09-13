import {
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
 * asset as an output". Rides the GIN index on `generations.output_asset_ids`
 * rather than needing an index of its own.
 */
const isGenerated = sql`exists (
  select 1 from ${generations}
  where ${generations.projectId} = ${assets.projectId}
    and ${assets.id} = any(${generations.outputAssetIds})
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
      let winner: (typeof candidates)[number] | undefined;
      for (const candidate of candidates) {
        if (!candidate.outputAssetIds.includes(assetId)) continue;
        if (!winner || isNewer(candidate, winner)) winner = candidate;
      }

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

interface GenerationCandidate {
  id: string;
  createdAt: Date;
}

/** The stated tiebreak for an asset produced by more than one generation: newest first, ties on id. */
function isNewer(candidate: GenerationCandidate, current: GenerationCandidate): boolean {
  const candidateTime = candidate.createdAt.getTime();
  const currentTime = current.createdAt.getTime();
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  return candidate.id > current.id;
}

function importedSummary(assetId: string): AssetSummary {
  return { assetId, origin: 'imported', generation: null };
}

function buildLibraryWhere(projectId: string, filter: AssetLibraryFilter): SQL {
  const conditions: SQL[] = [buildAssetWhere(projectId, filter)];

  if (filter.origin === 'generated') {
    conditions.push(isGenerated);
  } else if (filter.origin === 'imported') {
    conditions.push(sql`not (${isGenerated})`);
  }

  return and(...conditions) as SQL;
}
