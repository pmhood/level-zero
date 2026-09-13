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
import { useState } from 'react';

import { apiErrorMessage } from '@/lib/api';

import { AssetCompare } from './asset-compare';
import { AssetGrid, AssetGridSkeleton } from './asset-grid';
import { AssetInspector } from './asset-inspector';
import { AssetList, AssetListSkeleton } from './asset-list';
import { CollectionsIcon, PipelineIcon } from './asset-view-icons';
import { ASSET_LIBRARY_PAGE_SIZE, useAssetLibrary } from './use-assets';
import { useAssetView, type AssetView } from './use-asset-view';

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
 * The Assets workspace (issue #171): every asset the project has, in one
 * place — the grid and list presentations over #169/#170's read model,
 * reusing #133's `WorkspacePage`/`WorkspaceHeader` rather than a second
 * header implementation.
 *
 * No cinematic header artwork exists for this workspace yet — only
 * `/headers/world.jpg` is committed — so `image` is left out, the same
 * choice Characters, Mechanics and Moodboards already make. It becomes
 * cinematic the moment an art asset lands, with no code change here.
 *
 * Filters, upload, bulk actions, Collections and the Pipeline are later
 * issues (#172, #178–#179). The selected asset is the inspector's (#173);
 * this workspace decides what to show and how, and never a project-changing
 * action of its own.
 */
export function AssetsWorkspace({ projectId }: { projectId: string }) {
  const [view, changeView] = useAssetView();
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comparedWith, setComparedWith] = useState<Asset | null>(null);

  const libraryQuery = useAssetLibrary(projectId, page);

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
        <ViewSwitcher label="Asset views" items={VIEW_ITEMS} value={view} onChange={switchView} />
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
    return (
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
