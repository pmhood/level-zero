import { type Asset, type AssetPipelineStage } from './asset';
import { type AssetListFilter } from './asset-repository';
import { type AssetOrigin, type AssetSummary } from './asset-summary';
import { type AssetMarkKind } from '../selection/asset-mark';
import { type AssetSelectionState } from '../selection/asset-selection';

/**
 * `AssetListFilter` plus the facets the library's joined view can narrow by.
 * Every #169 filter and sort keeps working unchanged; #170 added `origin`,
 * #200 added `markKinds`, #201 added `selectionStates`, #202 added
 * `linkedEntityId`, and #226 adds `collectionId`.
 */
export interface AssetLibraryFilter extends AssetListFilter {
  origin?: AssetOrigin;
  /** Asset matches when it carries any of the requested kinds. */
  markKinds?: AssetMarkKind[];
  /**
   * Asset matches when it has a *current* selection in one of these states,
   * in any context — an older decision that was superseded or overtaken
   * never counts on the strength of the row it lost to.
   */
  selectionStates?: AssetSelectionState[];
  /**
   * Asset matches when it is reachable from this entity: its
   * `asset_reference` entity has a relationship edge to `linkedEntityId`, in
   * either direction.
   */
  linkedEntityId?: string;
  /**
   * Asset matches when its `asset_reference` entity has a `contains` edge
   * from this collection.
   */
  collectionId?: string;
}

export interface AssetLibraryPage {
  items: Asset[];
  /** One summary per item, in the same order. */
  summaries: AssetSummary[];
  /** Total matching rows, ignoring `limit`/`offset` — reflects every filter, including `origin`. */
  total: number;
}

/**
 * Storage port for the asset library's read model: one asset page joined
 * with the facts that live on other aggregates (origin today), for a grid
 * that needs a badge per tile without a follow-up query per tile.
 *
 * This is deliberately its own port rather than a bigger
 * `AssetRepository.listByProject` — the joins cross aggregates `AssetRepository`
 * has no business knowing about, and the plain asset page has callers
 * (`character-visuals`, `moodboard-rail`) that should not pay for them.
 */
export interface AssetLibraryReadModel {
  listByProject(projectId: string, filter: AssetLibraryFilter): Promise<AssetLibraryPage>;

  /**
   * Active member counts for every collection in the project that has at
   * least one, keyed by collection id — the rail's counts, one grouped read
   * rather than one `listForEntity` call per collection. A collection with
   * no active members (including one with none at all) is simply absent
   * from the result rather than present with `0`.
   */
  countsByCollection(projectId: string): Promise<Record<string, number>>;

  /**
   * The derived cover for every collection in the project that has at least
   * one active member — the newest one filed into it, by the membership
   * edge's `createdAt` (`docs/decisions/asset-library-model.md` §4.3: "the
   * cover is derived ... no column, no upload, no `data.coverAssetId`").
   * Keyed by collection id; a collection with no active members is simply
   * absent, the same convention `countsByCollection` uses.
   */
  coversByCollection(projectId: string): Promise<Record<string, Asset>>;

  /**
   * Active asset counts per pipeline stage across the whole project, keyed
   * by stage — the strip's counts, one grouped read rather than one
   * `listByProject` call per stage. A stage with no active assets is simply
   * absent from the result, the same convention `countsByCollection` uses.
   */
  countsByStage(projectId: string): Promise<Partial<Record<AssetPipelineStage, number>>>;
}
