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
import { useEffect, useState, type DragEvent, type KeyboardEvent } from 'react';

import { GenerationQueuePanel } from '@/features/generation/generation-queue-panel';
import { apiErrorMessage } from '@/lib/api';

import { AssetCollectionsRail } from './asset-collections-rail';
import { AssetCollectionsView } from './asset-collections-view';
import { AssetCompare } from './asset-compare';
import { AssetGrid, AssetGridSkeleton } from './asset-grid';
import { AssetInspector } from './asset-inspector';
import {
  assetLibraryFiltersToListParams,
  hasActiveAssetLibraryFilters,
} from './asset-library-filters';
import { AssetLibraryToolbar } from './asset-library-toolbar';
import { AssetList, AssetListSkeleton } from './asset-list';
import { AssetSelectionBar } from './asset-selection-bar';
import { AssetSelectionSummary } from './asset-selection-summary';
import { AssetUploadButton } from './asset-upload-button';
import { AssetUploadQueue } from './asset-upload-queue';
import { CollectionsIcon, PipelineIcon } from './asset-view-icons';
import { useAssetLibraryFilters } from './use-asset-library-filters';
import { type AssetClickModifiers, useAssetSelection } from './use-asset-selection';
import { useAssetUpload } from './use-asset-upload';
import { useAssetView, type AssetView } from './use-asset-view';
import { ASSET_LIBRARY_PAGE_SIZE, useAssetLibrary } from './use-assets';

const VIEW_ITEMS: ViewSwitcherItem<AssetView>[] = [
  { value: 'grid', label: 'Grid', icon: <GridIcon className="size-4" /> },
  { value: 'list', label: 'List', icon: <ListIcon className="size-4" /> },
  {
    value: 'collections',
    label: 'Collections',
    icon: <CollectionsIcon className="size-4" />,
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
 * Multi-select and bulk actions (#175) reuse the click that used to pick the
 * one asset the inspector shows: a plain click still does exactly that, and
 * shift/cmd-click grow it into a selection the bar above the grid/list acts
 * on. Selection lives in this component's own state — never persisted, and
 * gone the moment this workspace unmounts, per the issue's own scope
 * decision — and is cleared whenever the page underneath it changes, since a
 * page holds the only `Asset` records the bar and the inspector have to
 * act on.
 *
 * The Pipeline view is a later issue (#179). Collections (#227) is the rail
 * above the grid/list plus the switcher's third view, both reading #226's
 * collections and per-collection counts — never counting or picking a cover
 * from a fetched page.
 */
export function AssetsWorkspace({ projectId }: { projectId: string }) {
  const [view, changeView] = useAssetView();
  const [page, setPage] = useState(0);
  const [comparedWith, setComparedWith] = useState<Asset | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const { filters, setFilter, clearFilter, clearAll } = useAssetLibraryFilters();
  const upload = useAssetUpload(projectId);
  const selection = useAssetSelection();

  const listParams = assetLibraryFiltersToListParams(filters);
  const libraryQuery = useAssetLibrary(projectId, page, listParams);

  // A changed filter or sort re-queries a different result set, so a page
  // number and a selection built against the previous one would either ask
  // for rows that no longer exist there or act on ids the new page can't
  // resolve back to an `Asset`.
  useEffect(() => {
    setPage(0);
    selection.clear();
    setComparedWith(null);
  }, [filters, selection.clear]);

  const items = libraryQuery.data?.items ?? [];
  const summariesArray = libraryQuery.data?.summaries ?? [];
  const orderedIds = items.map((asset) => asset.id);
  const selectedAssets = items.filter((asset) => selection.isSelected(asset.id));
  const summaries: ReadonlyMap<string, AssetSummary> = new Map(
    items.map((asset, index) => [asset.id, summariesArray[index]!]),
  );

  function changePage(next: number) {
    selection.clear();
    setComparedWith(null);
    setPage(next);
  }

  function handleAssetClick(index: number, modifiers: AssetClickModifiers) {
    setComparedWith(null);
    selection.handleClick(orderedIds, index, modifiers);
  }

  function handleAssetToggle(index: number) {
    setComparedWith(null);
    selection.toggle(orderedIds, index);
  }

  function handleSelectAll() {
    setComparedWith(null);
    selection.selectAll(orderedIds);
  }

  function clearSelection() {
    setComparedWith(null);
    selection.clear();
  }

  function handleContainerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && selection.selectedCount > 0) clearSelection();
  }

  function switchView(next: AssetView) {
    changeView(next);
    changePage(0);
  }

  // Files dragged from outside the browser carry a "Files" type; the
  // library's own drag-and-drop (moodboard tiles, reordering) never does, so
  // this never lights up for anything already inside the app.
  function isFileDrag(event: DragEvent) {
    return event.dataTransfer.types.includes('Files');
  }

  function handleDragOver(event: DragEvent) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    setIsDraggingFiles(true);
  }

  function handleDragLeave(event: DragEvent) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDraggingFiles(false);
  }

  function handleDrop(event: DragEvent) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    setIsDraggingFiles(false);
    if (event.dataTransfer.files.length > 0) upload.addFiles(event.dataTransfer.files);
  }

  return (
    <WorkspacePage
      title="Asset Library"
      description="Every image, video, sound and file this project has produced or imported — one place to see what exists."
      actions={<AssetUploadButton onFilesSelected={upload.addFiles} />}
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
        selectedAssets.length === 1 ? (
          <AssetInspector
            projectId={projectId}
            asset={selectedAssets[0]!}
            summary={summaries.get(selectedAssets[0]!.id)}
            onClose={clearSelection}
            onCompare={setComparedWith}
          />
        ) : selectedAssets.length > 1 ? (
          <AssetSelectionSummary assets={selectedAssets} onClose={clearSelection} />
        ) : null
      }
    >
      <div
        data-testid="asset-library-dropzone"
        className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 xl:p-5 2xl:p-6"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onKeyDown={handleContainerKeyDown}
      >
        {isDraggingFiles && (
          <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-[var(--lz-blue-muted)]">
            <p className="text-sm font-semibold text-foreground">Drop to upload</p>
          </div>
        )}

        {/* The mockup's rail, below the toolbar and above the grid — every
            collection as a covered card (issue #227). The Collections view
            below already groups by collection, so the rail steps aside there
            rather than repeating the same list twice. */}
        {view !== 'collections' && (
          <AssetCollectionsRail
            projectId={projectId}
            onOpenCollections={() => switchView('collections')}
          />
        )}

        {/* Generations in flight for this project (#180) — what is
            generating now, not the pipeline or Collections views this
            workspace's view switcher still has disabled. */}
        <GenerationQueuePanel projectId={projectId} />

        <AssetUploadQueue items={upload.items} onRetry={upload.retry} onDismiss={upload.dismiss} />

        {/* Below one, the single asset's own inspector already offers
            Archive/Restore — a bar here would just duplicate its button
            under a second "Archive" with the same label. */}
        {selectedAssets.length > 1 && (
          <AssetSelectionBar
            projectId={projectId}
            selectedAssets={selectedAssets}
            summaries={summaries}
            onClear={clearSelection}
            onNarrowSelection={selection.replace}
          />
        )}

        {/* A comparison needs both panes side by side, so it takes the body
            rather than the 320px inspector that asked for it. */}
        {selectedAssets.length === 1 && comparedWith ? (
          <AssetCompare
            projectId={projectId}
            a={selectedAssets[0]!}
            b={comparedWith}
            onClose={() => setComparedWith(null)}
          />
        ) : view === 'collections' ? (
          <AssetCollectionsView projectId={projectId} listParams={listParams} />
        ) : (
          <AssetsBody
            projectId={projectId}
            view={view}
            page={page}
            onPageChange={changePage}
            isSelected={selection.isSelected}
            selectedCount={selection.selectedCount}
            onAssetClick={handleAssetClick}
            onAssetToggle={handleAssetToggle}
            onSelectAll={handleSelectAll}
            onClearSelection={clearSelection}
            isPending={libraryQuery.isPending}
            error={libraryQuery.error}
            onRetry={() => void libraryQuery.refetch()}
            data={libraryQuery.data}
            summaries={summaries}
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
  isSelected,
  selectedCount,
  onAssetClick,
  onAssetToggle,
  onSelectAll,
  onClearSelection,
  isPending,
  error,
  onRetry,
  data,
  summaries,
  hasActiveFilters,
  onClearFilters,
}: {
  projectId: string;
  view: AssetView;
  page: number;
  onPageChange: (page: number) => void;
  isSelected: (id: string) => boolean;
  selectedCount: number;
  onAssetClick: (index: number, modifiers: AssetClickModifiers) => void;
  onAssetToggle: (index: number) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  data: AssetLibraryPage | undefined;
  summaries: ReadonlyMap<string, AssetSummary>;
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

  const start = page * ASSET_LIBRARY_PAGE_SIZE + 1;
  const end = start + data.items.length - 1;
  const canGoBack = page > 0;
  const canGoForward = end < data.total;
  const allLoadedSelected = selectedCount === data.items.length;

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">All Assets ({data.total})</h2>
          {/* The list view's own header checkbox already offers this; the
              grid has no equivalent header row of its own, so it gets a
              text control here instead of a second checkbox convention. */}
          {view === 'grid' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={allLoadedSelected ? onClearSelection : onSelectAll}
            >
              {allLoadedSelected ? 'Deselect all' : `Select all ${data.items.length}`}
            </Button>
          )}
        </div>
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
          isSelected={isSelected}
          onRowClick={onAssetClick}
          onToggleRow={onAssetToggle}
          selectedCount={selectedCount}
          onSelectAll={onSelectAll}
          onClear={onClearSelection}
        />
      ) : (
        <AssetGrid
          projectId={projectId}
          assets={data.items}
          summaries={summaries}
          isSelected={isSelected}
          onClick={onAssetClick}
        />
      )}
    </>
  );
}
