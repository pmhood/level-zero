import { type Asset, type AssetKind, type AssetStatus, type AssetVariant } from './asset';

export interface AssetListFilter {
  kinds?: readonly AssetKind[];
  variants?: readonly AssetVariant[];
  statuses?: readonly AssetStatus[];
  /** Derivatives of this asset only (its thumbnails, previews, ...). */
  sourceAssetId?: string;
  /** Case-insensitive substring match against the filename. */
  search?: string;
  /** Archived assets are hidden unless this is true or `statuses` asks for them. */
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export interface AssetPage {
  items: Asset[];
  /** Total matching rows, ignoring `limit`/`offset`. */
  total: number;
}

/**
 * Storage port for asset metadata.
 *
 * Bytes live behind an `ObjectStorageProvider`; this repository only ever
 * sees the key that points at them. Every read is scoped by `projectId`, the
 * same as `EntityRepository` and `ProjectRepository`.
 */
export interface AssetRepository {
  insert(asset: Asset): Promise<Asset>;
  findById(projectId: string, assetId: string): Promise<Asset | null>;
  listByProject(projectId: string, filter: AssetListFilter): Promise<AssetPage>;
  save(asset: Asset): Promise<Asset>;
}
