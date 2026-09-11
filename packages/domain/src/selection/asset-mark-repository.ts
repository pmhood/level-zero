import { type AssetMark, type AssetMarkKind } from './asset-mark';

/**
 * Storage port for asset marks.
 *
 * A set, not a log: `add` is idempotent and `remove` is a real delete, because
 * a star that was taken away is not a fact anybody needs later. That is the
 * whole difference from `AssetSelectionRepository`, which never deletes
 * anything.
 */
export interface AssetMarkRepository {
  /** Adds the mark if it is not already there, and answers with the mark as it stands. */
  add(mark: AssetMark): Promise<AssetMark>;
  /** Takes the mark off. False when it was not there. */
  remove(projectId: string, assetId: string, kind: AssetMarkKind): Promise<boolean>;
  /** The project's marks, newest first, narrowed to `kinds` when given. */
  listByProject(projectId: string, kinds?: readonly AssetMarkKind[]): Promise<AssetMark[]>;
}
