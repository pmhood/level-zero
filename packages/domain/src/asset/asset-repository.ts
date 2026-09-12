import { type Asset, type AssetKind, type AssetStatus, type AssetVariant } from './asset';

/** Fields the asset listing can be ordered by. */
export const ASSET_SORT_FIELDS = ['createdAt', 'updatedAt', 'filename', 'byteSize'] as const;
export type AssetSortField = (typeof ASSET_SORT_FIELDS)[number];

export const ASSET_SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type AssetSortDirection = (typeof ASSET_SORT_DIRECTIONS)[number];

export interface AssetListFilter {
  kinds?: readonly AssetKind[];
  variants?: readonly AssetVariant[];
  statuses?: readonly AssetStatus[];
  /** Derivatives of this asset only (its thumbnails, previews, ...). */
  sourceAssetId?: string;
  /** Case-insensitive substring match against the filename. */
  search?: string;
  /**
   * The part of `mimeType` before the slash: "image", "video", "audio",
   * "application", ... Not a second enum beside `AssetKind` — `kind` is what
   * a file is *for*, this is what it *is*.
   */
  mimeFamilies?: readonly string[];
  /** Inclusive lower bound on `createdAt`. */
  createdAfter?: Date;
  /** Exclusive upper bound on `createdAt`. */
  createdBefore?: Date;
  /** Archived assets are hidden unless this is true or `statuses` asks for them. */
  includeArchived?: boolean;
  /** Defaults to `createdAt`. */
  sortBy?: AssetSortField;
  /** Defaults to `desc`. Every sort ties on `id`, so paging never drops or repeats a row. */
  sortDirection?: AssetSortDirection;
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
