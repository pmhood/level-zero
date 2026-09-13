import { type Asset } from './asset';
import { type AssetListFilter } from './asset-repository';
import { type AssetOrigin, type AssetSummary } from './asset-summary';
import { type AssetMarkKind } from '../selection/asset-mark';

/**
 * `AssetListFilter` plus the facets the library's joined view can narrow by.
 * Every #169 filter and sort keeps working unchanged; this issue adds
 * `origin`, and #200-#202 each add one more field here.
 */
export interface AssetLibraryFilter extends AssetListFilter {
  origin?: AssetOrigin;
  /** Asset matches when it carries any of the requested kinds. */
  markKinds?: AssetMarkKind[];
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
}
