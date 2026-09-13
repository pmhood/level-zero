'use client';

import type { Asset, AssetLibraryPage, AssetSummary } from '@level-zero/domain';
import {
  Button,
  EmptyState,
  GridIcon,
  ListIcon,
  ViewSwitcher,
  WorkspacePage,
  type ViewSwitcherItem,
} from '@level-zero/ui';
import { useEffect, useState } from 'react';

import { apiErrorMessage } from '@/lib/api';

import { AssetCompare } from './asset-compare';
import { AssetGrid, AssetGridSkeleton } from './asset-grid';
import { AssetInspector } from './asset-inspector';
import { assetLibraryFiltersToListParams, hasActiveAssetLibraryFilters } from './asset-library-filters';
import { AssetLibraryToolbar } from './asset-library-toolbar';
import { AssetList, AssetListSkeleton } from './asset-list';
import { CollectionsIcon, PipelineIcon } from './asset-view-icons';
import { useAssetLibraryFilters } from './use-asset-library-filters';
import { useAssetView, type AssetView } from './use-asset-view';
import { ASSET_LIBRARY_PAGE_SIZE, useAssetLibrary } from './use-assets';

const VIEW_ITEMS: ViewSwitcherItem<AssetView>[] = [
  { value: 'grid', label: 'Grid', icon: <GridIcon className="size-4" /> },
  { value: 'list', label: 'List', icon: <ListIcon className="size-4" /> },
  {
    value: 'collections',
    label: 'Collections',
    icon: <CollectionsIcon className="size-4" />,
    disabled: true,
  },
  {
    value: 'pipeline',
    label: 'Pipeline',
    icon: <PipelineIcon className="size-4" />,
    disabled: true,
  },
];

/**
 * The Assets workspace (issue #171, with #172's filter/sort/search toolbar):
 * every asset the project has, in one place — the grid and list
 * presentations over #169/#170's read model, reusing #133's
 * `WorkspacePage`/`WorkspaceHeader` rather than a second header
 * implementation.
 *
 * No cinematic header artwork exists for this workspace yet — only
 * `/headers/world.jpg` is committed — so `image` is left out, the same
 * choice Characters, Mechanics and Moodboards already make. It becomes
 * cinematic the moment an art asset lands, with no code change here.
 *
 * Upload, bulk actions, Collections and the Pipeline are later issues
 * (#178–#179). The toolbar above the grid/list is #172's; the selected
 * asset is the inspector's (#173) — this workspace decides what to show and
 * how, never a project-changing action of its own.
 */
export function AssetsWorkspace({ projectId }: { projectId: string }) {
  const [view, changeView] = useAssetView();
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comparedWith, setComparedWith] = useState<Asset | null>(null);
  const { filters, setFilter, clearFilter, clearAll } = useAssetLibraryFilters();

  const listParams = assetLibraryFiltersToListParams(filters);
  const libraryQuery = useAssetLibrary(projectId, page, listParams);

  // A changed filter or sort re-queries a different result set, so a page
  // number left over from the previous one would ask for rows that may no
  // longer exist there.
  useEffect(() => {
    setPage(0);
  }, [filters]);

  const items = libraryQuery.data?.items ?? [];
  const selectedIndex = items.findIndex((asset) => asset.id === selectedId);
  const selected = selectedIndex === -1 ? null : items[selectedIndex]!;
  const selectedSummary =
    selectedIndex === -1 ? undefined : libraryQuery.data?.summaries[selectedIndex];

  function select(asset: Asset) {
    setComparedWith(null);
    setSelectedId((current) => (current === asset.id ? null : asset.id));
  }

  function switchView(next: AssetView) {
    changeView(next);
    setPage(0);
  }

  return (
    <WorkspacePage
      title="Asset Library"
      description="Every image, video, sound and file this project has produced or imported — one place to see what exists."
      toolbar={
        <AssetLibraryToolbar
          projectId={projectId}
          filters={filters}
          setFilter={setFilter}
          clearFilter={clearFilter}
          clearAll={clearAll}
          viewSwitcher={
            <ViewSwitcher
              label="Asset views"
              items={VIEW_ITEMS}
              value={view}
              onChange={switchView}
            />
          }
        />
      }
      inspector={
        selected && (
          <AssetInspector
            projectId={projectId}
            asset={selected}
            summary={selectedSummary}
            onClose={() => {
              setSelectedId(null);
              setComparedWith(null);
            }}
            onCompare={setComparedWith}
          />
        )
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 xl:p-5 2xl:p-6">
        {/* A comparison needs both panes side by side, so it takes the body
            rather than the 320px inspector that asked for it. */}
        {selected && comparedWith ? (
          <AssetCompare
            projectId={projectId}
            a={selected}
            b={comparedWith}
            onClose={() => setComparedWith(null)}
          />
        ) : (
          <AssetsBody
            projectId={projectId}
            view={view}
            page={page}
            onPageChange={setPage}
            selectedId={selectedId}
            onSelect={select}
            isPending={libraryQuery.isPending}
            error={libraryQuery.error}
            onRetry={() => void libraryQuery.refetch()}
            data={libraryQuery.data}
            hasActiveFilters={hasActiveAssetLibraryFilters(filters)}
            onClearFilters={clearAll}
          />
        )}
      </div>
    </WorkspacePage>
  );
}

function AssetsBody({
  projectId,
  view,
  page,
  onPageChange,
  selectedId,
  onSelect,
  isPending,
  error,
  onRetry,
  data,
  hasActiveFilters,
  onClearFilters,
}: {
  projectId: string;
  view: AssetView;
  page: number;
  onPageChange: (page: number) => void;
  selectedId: string | null;
  onSelect: (asset: Asset) => void;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  data: AssetLibraryPage | undefined;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}) {
  if (isPending) {
    return view === 'list' ? <AssetListSkeleton /> : <AssetGridSkeleton />;
  }

  if (error != null) {
    return (
      <EmptyState
        title="Couldn't load the asset library"
        description={apiErrorMessage(error)}
        actions={<Button onClick={onRetry}>Try again</Button>}
      />
    );
  }

  if (!data || data.total === 0) {
    return hasActiveFilters ? (
      <EmptyState
        title="No assets match these filters"
        description="Try clearing a filter or two, or the search text — nothing in this project's library fits all of them at once."
        actions={
          <Button variant="secondary" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        title="No assets yet"
        description="Upload production media or generate it from a workspace — every image, sound and file the project produces lands here."
      />
    );
  }

  const summaries: ReadonlyMap<string, AssetSummary> = new Map(
    data.items.map((asset, index) => [asset.id, data.summaries[index]!]),
  );

  const start = page * ASSET_LIBRARY_PAGE_SIZE + 1;
  const end = start + data.items.length - 1;
  const canGoBack = page > 0;
  const canGoForward = end < data.total;

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">All Assets ({data.total})</h2>
        <div className="flex items-center gap-3">
          <p className="text-xs text-faint-foreground">
            {start}–{end} of {data.total}
          </p>
          <div className="flex gap-1">
            <Button
              variant="secondary"
              size="sm"
              disabled={!canGoBack}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!canGoForward}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {view === 'list' ? (
        <AssetList
          assets={data.items}
          summaries={summaries}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : (
        <AssetGrid
          projectId={projectId}
          assets={data.items}
          summaries={summaries}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}
    </>
  );
}
