'use client';

import type { Asset, AssetLibraryPage, Entity } from '@level-zero/domain';
import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';

import * as api from '@/lib/api';

/**
 * How many members a Collections-view group shows before the rest are just
 * reflected in its own total — a group is a shelf, not a second paginated
 * grid; the toolbar's own collection filter (a later issue) is where seeing
 * the rest of one collection belongs.
 */
export const COLLECTION_GROUP_PAGE_SIZE = 24;

const collectionKeys = {
  counts: (projectId: string) => ['projects', projectId, 'asset-collections', 'counts'] as const,
  covers: (projectId: string) => ['projects', projectId, 'asset-collections', 'covers'] as const,
  group: (projectId: string, collectionId: string, params: api.ListAssetLibraryParams) =>
    ['projects', projectId, 'assets', 'library', 'collection', collectionId, params] as const,
};

/** Active member counts for every collection in the project (issue #227's rail). */
export function useCollectionCounts(projectId: string) {
  return useQuery({
    queryKey: collectionKeys.counts(projectId),
    queryFn: () => api.collectionCounts(projectId),
    enabled: Boolean(projectId),
  });
}

/** The derived cover for every collection in the project that has one (issue #227's rail). */
export function useCollectionCovers(projectId: string) {
  return useQuery({
    queryKey: collectionKeys.covers(projectId),
    queryFn: () => api.collectionCovers(projectId),
    enabled: Boolean(projectId),
  });
}

/** The cover asset for one collection, or `undefined` while it loads or if it has none. */
export function collectionCover(
  covers: Record<string, Asset> | undefined,
  collectionId: string,
): Asset | undefined {
  return covers?.[collectionId];
}

export type CollectionGroupQuery = UseQueryResult<AssetLibraryPage>;

/**
 * One page per collection, in parallel, each carrying whatever the toolbar's
 * other filters currently narrow by (#172) plus that collection's own
 * `collectionId` — the Collections view's grouping (issue #227). Every group
 * still round-trips its own `total` from the read model, the same "no
 * client-side narrowing" rule the flat grid and list follow.
 */
export function useCollectionGroups(
  projectId: string,
  collections: readonly Entity[],
  listParams: api.ListAssetLibraryParams,
): CollectionGroupQuery[] {
  return useQueries({
    queries: collections.map((collection) => ({
      queryKey: collectionKeys.group(projectId, collection.id, listParams),
      queryFn: () =>
        api.listAssetLibrary(projectId, {
          ...listParams,
          collectionId: collection.id,
          limit: COLLECTION_GROUP_PAGE_SIZE,
          offset: 0,
        }),
      enabled: Boolean(projectId),
    })),
  });
}
