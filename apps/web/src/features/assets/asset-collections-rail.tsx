'use client';

import { EmptyState, MediaCard, MediaCardSkeleton } from '@level-zero/ui';

import { useEntitiesByType } from '@/features/entities/use-entities';

import { AssetPreview } from './asset-preview';
import { CollectionsIcon } from './asset-view-icons';
import { collectionCover, useCollectionCounts, useCollectionCovers } from './use-asset-collections';

const RAIL_GRID_CLASSNAME = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6';

export interface AssetCollectionsRailProps {
  projectId: string;
  /** A collection tile, or the row's own "View All", was activated — the switcher's Collections slot. */
  onOpenCollections: () => void;
}

/**
 * The rail above the grid (issue #227): every collection in the project as a
 * covered card with its active member count, reusing `MediaCard` rather than
 * a parallel tile of its own. Counts and covers are the read model's
 * (#226) — never counted or picked from a fetched page.
 *
 * Every card, and "View All", open the same place: the switcher's Collections
 * view. A deep link into one specific collection is the toolbar filter's job
 * (a later issue), not this rail's.
 */
export function AssetCollectionsRail({ projectId, onOpenCollections }: AssetCollectionsRailProps) {
  const collectionsQuery = useEntitiesByType(projectId, 'asset_collection');
  const countsQuery = useCollectionCounts(projectId);
  const coversQuery = useCollectionCovers(projectId);

  if (collectionsQuery.isPending) {
    return (
      <div aria-label="Loading collections" className={RAIL_GRID_CLASSNAME}>
        {Array.from({ length: 4 }, (_, index) => (
          <MediaCardSkeleton key={index} aspect="landscape" />
        ))}
      </div>
    );
  }

  // The rail is a convenience shelf, not the workspace's only view of
  // collections — a failed read here just means one fewer shortcut, not a
  // blocked page, so it fails quiet rather than displacing the grid below it.
  if (collectionsQuery.error) return null;

  const collections = collectionsQuery.data?.items ?? [];

  if (collections.length === 0) {
    return (
      <EmptyState
        className="py-6"
        title="No collections yet"
        description="Group assets by art direction — Props & Gear, UI & HUD — and they'll show up here as a shelf above the grid."
      />
    );
  }

  const counts = countsQuery.data;
  const covers = coversQuery.data;

  return (
    <section aria-label="Collections" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Collections</h2>
        <button
          type="button"
          onClick={onOpenCollections}
          className="text-xs font-medium text-primary hover:underline"
        >
          View All
        </button>
      </div>
      <ul role="list" className={RAIL_GRID_CLASSNAME}>
        {collections.map((collection) => {
          const count = counts?.[collection.id] ?? 0;
          const cover = collectionCover(covers, collection.id);
          return (
            <li key={collection.id}>
              <MediaCard
                aspect="landscape"
                onClick={onOpenCollections}
                ariaLabel={collection.name}
                media={
                  cover ? (
                    <AssetPreview projectId={projectId} asset={cover} />
                  ) : (
                    <div className="flex size-full items-center justify-center text-faint-foreground">
                      <CollectionsIcon className="size-6" />
                    </div>
                  )
                }
                title={collection.name}
                subtitle={`${count} ${count === 1 ? 'asset' : 'assets'}`}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
