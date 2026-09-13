import {
  ASSET_LINKED_ENTITIES_CAP,
  ASSET_MARK_KINDS,
  ASSET_REFERENCE_ASSET_ID_KEY,
  isApprovedInAnyContext,
  pickNewestOrigin,
  summarizeCurrentSelections,
  type AssetLibraryFilter,
  type AssetLibraryPage,
  type AssetLibraryReadModel,
  type AssetLinkedEntitiesSummary,
  type AssetMarkKind,
  type AssetSelectionState,
  type AssetSelectionSummaryEntry,
  type AssetSummary,
  type EntityType,
} from '@level-zero/domain';
import { and, arrayOverlaps, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import { assets } from '../schema/assets';
import { entities } from '../schema/entities';
import { entityRelationships } from '../schema/entity-relationships';
import { assetMarks, assetSelections } from '../schema/selections';
import { generations } from '../schema/generations';
import { buildAssetOrderBy, buildAssetWhere } from './asset-repository';
import { toAsset, toAssetSelection } from './mappers';

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
 * `project_id`. Each facet adds exactly one extra statement to the page —
 * `originsFor`, `marksFor`, `selectionsFor` and `linkedEntitiesFor` each run
 * once for the whole page, batched over its asset ids — so the query count
 * is fixed regardless of how many assets are on the page, not one lookup per
 * asset.
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

    const assetIds = rows.map((row) => row.id);
    const [origins, marks, selections, linkedEntities, thumbnails] = await Promise.all([
      this.originsFor(projectId, assetIds),
      this.marksFor(projectId, assetIds),
      this.selectionsFor(projectId, assetIds),
      this.linkedEntitiesFor(projectId, assetIds),
      this.thumbnailsFor(projectId, assetIds),
    ]);

    return {
      items: rows.map(toAsset),
      summaries: rows.map((row) => {
        const origin = origins.get(row.id) ?? importedSummary(row.id);
        const markKinds = marks.get(row.id) ?? [];
        const entries = selections.get(row.id) ?? [];
        return {
          ...origin,
          markKinds,
          selections: entries,
          approved: isApprovedInAnyContext(entries),
          linkedEntities: linkedEntities.get(row.id) ?? { entities: [], total: 0 },
          thumbnailAssetId: thumbnails.get(row.id) ?? null,
        };
      }),
      total: totals?.value ?? 0,
    };
  }

  /**
   * The page's generated thumbnails (#176), keyed by source asset id. One
   * query for the whole page, not one per asset: every `thumbnail` variant
   * in the project whose `sourceAssetId` is on this page.
   */
  private async thumbnailsFor(projectId: string, assetIds: string[]): Promise<Map<string, string>> {
    const bySource = new Map<string, string>();
    if (assetIds.length === 0) return bySource;

    const rows = await this.db
      .select({ id: assets.id, sourceAssetId: assets.sourceAssetId })
      .from(assets)
      .where(
        and(
          eq(assets.projectId, projectId),
          eq(assets.variant, 'thumbnail'),
          inArray(assets.sourceAssetId, assetIds),
        ),
      );

    for (const row of rows) {
      if (row.sourceAssetId) bySource.set(row.sourceAssetId, row.id);
    }
    return bySource;
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
  ): Promise<
    Map<
      string,
      Omit<
        AssetSummary,
        'markKinds' | 'selections' | 'approved' | 'linkedEntities' | 'thumbnailAssetId'
      >
    >
  > {
    const summaries = new Map<
      string,
      Omit<
        AssetSummary,
        'markKinds' | 'selections' | 'approved' | 'linkedEntities' | 'thumbnailAssetId'
      >
    >();
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
          : { assetId, origin: 'imported', generation: null },
      );
    }

    return summaries;
  }

  /**
   * Mark kinds for the asset page, in ASSET_MARK_KINDS order.
   * One query for the whole page, not one per asset.
   */
  private async marksFor(
    projectId: string,
    assetIds: string[],
  ): Promise<Map<string, AssetMarkKind[]>> {
    const marks = new Map<string, AssetMarkKind[]>();
    if (assetIds.length === 0) return marks;

    const rows = await this.db
      .select({
        assetId: assetMarks.assetId,
        kind: assetMarks.kind,
      })
      .from(assetMarks)
      .where(and(eq(assetMarks.projectId, projectId), inArray(assetMarks.assetId, assetIds)));

    for (const assetId of assetIds) {
      const assetMarksOfAll = rows.filter((row) => row.assetId === assetId).map((row) => row.kind);
      // Sort in ASSET_MARK_KINDS order for consistent rendering
      const sorted = assetMarksOfAll.sort(
        (a, b) => ASSET_MARK_KINDS.indexOf(a) - ASSET_MARK_KINDS.indexOf(b),
      );
      marks.set(assetId, sorted);
    }

    return marks;
  }

  /**
   * One query for the whole page, not one per asset: every selection ever
   * recorded for the page's asset ids, folded to the newest decision per
   * `(asset, context)` by `summarizeCurrentSelections` — the shared fold, so
   * this never re-derives the precedence rule.
   */
  private async selectionsFor(
    projectId: string,
    assetIds: string[],
  ): Promise<Map<string, AssetSelectionSummaryEntry[]>> {
    if (assetIds.length === 0) return new Map();

    const rows = await this.db
      .select()
      .from(assetSelections)
      .where(
        and(eq(assetSelections.projectId, projectId), inArray(assetSelections.assetId, assetIds)),
      )
      .orderBy(desc(assetSelections.decidedAt), desc(assetSelections.id));

    return summarizeCurrentSelections(rows.map(toAssetSelection));
  }

  /**
   * One query for the whole page, not one per asset: two hops from each
   * asset — its `asset_reference` entity (`refs`, keyed by
   * `data->>'assetId'`), then that entity's relationship edges in either
   * direction (`linked`) — folded to one row per distinct `(asset, entity)`
   * pair by the `union` itself (plain `union`, not `union all`, so a second
   * edge between the same pair collapses rather than duplicating it) before
   * a windowed `row_number`/`count` in `ranked` caps and counts in the same
   * pass. An asset with no `asset_reference` entity, or one whose reference
   * relates to nothing, has no rows here and is filled in with a zero
   * summary by the caller.
   */
  private async linkedEntitiesFor(
    projectId: string,
    assetIds: string[],
  ): Promise<Map<string, AssetLinkedEntitiesSummary>> {
    const summaries = new Map<string, AssetLinkedEntitiesSummary>();
    if (assetIds.length === 0) return summaries;

    const assetIdList = sql.join(
      assetIds.map((assetId) => sql`${assetId}`),
      sql`, `,
    );

    const result = await this.db.execute<{
      assetId: string;
      entityId: string;
      type: EntityType;
      name: string;
      total: number;
    }>(sql`
      with refs as (
        select
          ${entities.id} as reference_id,
          ${entities.data} ->> ${ASSET_REFERENCE_ASSET_ID_KEY} as asset_id
        from ${entities}
        where ${entities.projectId} = ${projectId}
          and ${entities.type} = 'asset_reference'
          and ${entities.data} ->> ${ASSET_REFERENCE_ASSET_ID_KEY} in (${assetIdList})
      ),
      linked as (
        select refs.asset_id, ${entityRelationships.targetEntityId} as entity_id
        from ${entityRelationships}
        join refs on ${entityRelationships.sourceEntityId} = refs.reference_id
        where ${entityRelationships.projectId} = ${projectId}
        union
        select refs.asset_id, ${entityRelationships.sourceEntityId} as entity_id
        from ${entityRelationships}
        join refs on ${entityRelationships.targetEntityId} = refs.reference_id
        where ${entityRelationships.projectId} = ${projectId}
      ),
      ranked as (
        select
          linked.asset_id,
          ${entities.id} as entity_id,
          ${entities.type} as type,
          ${entities.name} as name,
          row_number() over (partition by linked.asset_id order by ${entities.name}, ${entities.id}) as rank,
          count(*) over (partition by linked.asset_id) as total
        from linked
        join ${entities} on ${entities.id} = linked.entity_id
      )
      select
        asset_id as "assetId",
        entity_id as "entityId",
        type,
        name,
        total::int as total
      from ranked
      where rank <= ${ASSET_LINKED_ENTITIES_CAP}
      order by asset_id, rank
    `);

    for (const row of result.rows) {
      const summary = summaries.get(row.assetId) ?? { entities: [], total: row.total };
      summary.entities.push({ entityId: row.entityId, type: row.type, name: row.name });
      summaries.set(row.assetId, summary);
    }

    return summaries;
  }
}

function importedSummary(
  assetId: string,
): Omit<
  AssetSummary,
  'markKinds' | 'selections' | 'approved' | 'linkedEntities' | 'thumbnailAssetId'
> {
  return { assetId, origin: 'imported', generation: null };
}

/**
 * Correlated existence check for "this asset has at least one of the requested
 * mark kinds".
 */
function hasMarkKinds(markKinds: readonly AssetMarkKind[]): SQL {
  return sql`exists (
    select 1 from ${assetMarks}
    where ${assetMarks.projectId} = ${assets.projectId}
      and ${assetMarks.assetId} = ${assets.id}
      and ${inArray(assetMarks.kind, markKinds)}
  )`;
}

/**
 * Correlated check for "this asset has a *current* selection in one of the
 * requested states, in any context".
 *
 * `distinct on (context_entity_id, purpose) ... order by ... decided_at desc,
 * id desc` folds to the newest row per context before `state` is ever
 * tested — the same precedence `latestSelectionByAsset` applies — so an
 * approval that was later superseded or rejected cannot match on the
 * strength of the row it lost to. The outer `where` is an equality on
 * `(project_id, asset_id)`, exactly `asset_selections_project_asset_idx`, so
 * this reads the (typically few) rows for one asset via that index and only
 * sorts within them.
 */
function hasSelectionInStates(states: readonly AssetSelectionState[]): SQL {
  const wanted = sql.join(
    states.map((state) => sql`${state}`),
    sql`, `,
  );

  return sql`exists (
    select 1 from (
      select distinct on (${assetSelections.contextEntityId}, ${assetSelections.purpose})
        ${assetSelections.state} as state
      from ${assetSelections}
      where ${assetSelections.projectId} = ${assets.projectId}
        and ${assetSelections.assetId} = ${assets.id}
      order by
        ${assetSelections.contextEntityId},
        ${assetSelections.purpose},
        ${assetSelections.decidedAt} desc,
        ${assetSelections.id} desc
    ) latest
    where latest.state in (${wanted})
  )`;
}

/**
 * Correlated existence check for "this asset's `asset_reference` entity has
 * a relationship edge to `entityId`, in either direction" — the same two
 * hops `linkedEntitiesFor` follows, narrowed to one target entity instead of
 * grouped and capped.
 */
function isLinkedToEntity(entityId: string): SQL {
  return sql`exists (
    select 1
    from ${entities}
    where ${entities.projectId} = ${assets.projectId}
      and ${entities.type} = 'asset_reference'
      and (${entities.data} ->> ${ASSET_REFERENCE_ASSET_ID_KEY})::uuid = ${assets.id}
      and exists (
        select 1 from ${entityRelationships}
        where ${entityRelationships.projectId} = ${entities.projectId}
          and (
            (${entityRelationships.sourceEntityId} = ${entities.id}
              and ${entityRelationships.targetEntityId} = ${entityId})
            or (${entityRelationships.targetEntityId} = ${entities.id}
              and ${entityRelationships.sourceEntityId} = ${entityId})
          )
      )
  )`;
}

/** Exported so a test can assert the origin filter compiles to an index-friendly plan. */
export function buildLibraryWhere(projectId: string, filter: AssetLibraryFilter): SQL {
  const conditions: SQL[] = [buildAssetWhere(projectId, filter)];

  if (filter.origin === 'generated') {
    conditions.push(isGenerated);
  } else if (filter.origin === 'imported') {
    conditions.push(sql`not (${isGenerated})`);
  }

  if (filter.markKinds && filter.markKinds.length > 0) {
    conditions.push(hasMarkKinds(filter.markKinds));
  }

  if (filter.selectionStates && filter.selectionStates.length > 0) {
    conditions.push(hasSelectionInStates(filter.selectionStates));
  }

  if (filter.linkedEntityId) {
    conditions.push(isLinkedToEntity(filter.linkedEntityId));
  }

  return and(...conditions) as SQL;
}
