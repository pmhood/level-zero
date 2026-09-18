'use client';

import type { AssetSummary, Entity } from '@level-zero/domain';
import { Button, EmptyState } from '@level-zero/ui';

import { useEntitiesByType } from '@/features/entities/use-entities';
import { apiErrorMessage, type ListAssetLibraryParams } from '@/lib/api';

import { AssetGrid, AssetGridSkeleton } from './asset-grid';
import { type CollectionGroupQuery, useCollectionGroups } from './use-asset-collections';

export interface AssetCollectionsViewProps {
  projectId: string;
  /** The toolbar's other filters (#172) — every group still narrows by these, just adding its own `collectionId`. */
  listParams: ListAssetLibraryParams;
}

/**
 * The switcher's Collections view (issue #227): every collection in the
 * project as its own section, each grouping the assets filed in it — the
 * mockup's alternative to one flat grid once a library has hundreds of
 * assets across a handful of collections.
 *
 * Selection and the inspector stay the flat grid/list's own (#175):
 * grouping here is read-only, the same way the rail's cards are — clicking
 * into one collection to select and act on its members is the toolbar
 * filter's job, a later issue this one deliberately leaves room for.
 */
export function AssetCollectionsView({ projectId, listParams }: AssetCollectionsViewProps) {
  const collectionsQuery = useEntitiesByType(projectId, 'asset_collection');
  const collections = collectionsQuery.data?.items ?? [];
  const groupQueries = useCollectionGroups(projectId, collections, listParams);

  if (collectionsQuery.isPending) {
    return <AssetGridSkeleton />;
  }

  if (collectionsQuery.error) {
    return (
      <EmptyState
        title="Couldn't load collections"
        description={apiErrorMessage(collectionsQuery.error)}
        actions={<Button onClick={() => void collectionsQuery.refetch()}>Try again</Button>}
      />
    );
  }

  if (collections.length === 0) {
    return (
      <EmptyState
        title="No collections yet"
        description="Group assets by art direction — Props & Gear, UI & HUD — and each one will get its own section here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {collections.map((collection, index) => (
        <CollectionGroup
          key={collection.id}
          projectId={projectId}
          collection={collection}
          query={groupQueries[index]!}
        />
      ))}
    </div>
  );
}

function CollectionGroup({
  projectId,
  collection,
  query,
}: {
  projectId: string;
  collection: Entity;
  query: CollectionGroupQuery;
}) {
  const page = query.data;
  const items = page?.items ?? [];
  const summaries: ReadonlyMap<string, AssetSummary> = new Map(
    items.map((asset, index) => [asset.id, page!.summaries[index]!]),
  );

  return (
    <section aria-label={collection.name} className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">
        {collection.name}
        {page && <span className="ml-1 font-normal text-faint-foreground">({page.total})</span>}
      </h3>

      {query.isPending ? (
        <AssetGridSkeleton count={4} />
      ) : query.error ? (
        <EmptyState
          title="Couldn't load this collection"
          description={apiErrorMessage(query.error)}
          actions={<Button onClick={() => void query.refetch()}>Try again</Button>}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No assets in this collection"
          description={`Nothing has been filed into "${collection.name}" yet.`}
        />
      ) : (
        <AssetGrid projectId={projectId} assets={items} summaries={summaries} />
      )}
    </section>
  );
}
