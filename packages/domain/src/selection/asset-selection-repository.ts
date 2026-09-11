import { type AssetSelection, type AssetSelectionContext } from './asset-selection';

/**
 * Storage port for asset selections.
 *
 * There is no update and no delete, the same as `ReviewDecisionRepository`: a
 * selection is an act somebody took at a moment. What is current is read out of
 * the history, so nothing can overwrite who chose what — and a rejected or
 * superseded asset stays as inspectable as the approved one.
 *
 * Every read comes back newest first, which is the order
 * `latestSelectionByAsset` relies on.
 */
export interface AssetSelectionRepository {
  /**
   * Writes one approval together with the supersessions it causes.
   *
   * One call rather than several, because a `superseded` row that names an
   * approval only makes sense if that approval was written too.
   */
  insertMany(selections: readonly AssetSelection[]): Promise<AssetSelection[]>;
  /** Every decision in one context. */
  listByContext(projectId: string, context: AssetSelectionContext): Promise<AssetSelection[]>;
  /** Every decision about one asset, across every context it was considered for. */
  listByAsset(projectId: string, assetId: string): Promise<AssetSelection[]>;
  /** Every decision made for one entity, across all of its purposes. */
  listByContextEntity(projectId: string, entityId: string): Promise<AssetSelection[]>;
}
