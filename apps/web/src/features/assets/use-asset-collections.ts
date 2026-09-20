'use client';

import type { Asset, AssetLibraryPage, Entity } from '@level-zero/domain';
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import * as api from '@/lib/api';

import { assetKeys } from './use-assets';

/**
 * How many members a Collections-view group shows before the rest are just
 * reflected in its own total — a group is a shelf, not a second paginated
 * grid; the toolbar's own collection filter (#228) is where seeing the rest
 * of one collection belongs.
 */
export const COLLECTION_GROUP_PAGE_SIZE = 24;

const collectionKeys = {
  counts: (projectId: string) => ['projects', projectId, 'asset-collections', 'counts'] as const,
  covers: (projectId: string) => ['projects', projectId, 'asset-collections', 'covers'] as const,
  group: (projectId: string, collectionId: string, params: api.ListAssetLibraryParams) =>
    ['projects', projectId, 'assets', 'library', 'collection', collectionId, params] as const,
  forAsset: (projectId: string, assetId: string) =>
    ['projects', projectId, 'asset-collections', 'for-asset', assetId] as const,
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

/** Every collection the selected asset currently belongs to (the inspector's Collection field, #228). */
export function useAssetCollections(projectId: string, assetId: string) {
  return useQuery({
    queryKey: collectionKeys.forAsset(projectId, assetId),
    queryFn: () => api.collectionsForAsset(projectId, assetId),
    enabled: Boolean(projectId) && Boolean(assetId),
  });
}

/**
 * Filing an asset into a collection, or taking it out of one, from the
 * inspector (#228). Both invalidate every read that depends on membership:
 * the asset's own collection list, the rail's counts and cover (#227), and,
 * since `collectionId` is now a toolbar filter too, the library listing
 * itself — a removal made here should drop the asset from a
 * collection-filtered grid without a reload.
 */
function useAssetCollectionMutation(
  projectId: string,
  mutationFn: (input: { collectionId: string; assetId: string }) => Promise<unknown>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (_data, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.forAsset(projectId, assetId) });
      queryClient.invalidateQueries({ queryKey: collectionKeys.counts(projectId) });
      queryClient.invalidateQueries({ queryKey: collectionKeys.covers(projectId) });
      queryClient.invalidateQueries({ queryKey: assetKeys.all(projectId) });
    },
  });
}

export function useAddAssetToCollection(projectId: string) {
  return useAssetCollectionMutation(projectId, ({ collectionId, assetId }) =>
    api.addAssetToCollection(projectId, collectionId, assetId),
  );
}

export function useRemoveAssetFromCollection(projectId: string) {
  return useAssetCollectionMutation(projectId, ({ collectionId, assetId }) =>
    api.removeAssetFromCollection(projectId, collectionId, assetId),
  );
}
