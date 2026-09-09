'use client';

import type { Entity } from '@level-zero/domain';
import { Button, EmptyState, Inspector, PlusIcon, Tabs, WorkspacePage } from '@level-zero/ui';
import { useMemo, useState } from 'react';

import { apiErrorMessage } from '@/lib/api';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { WorldBrowser, EMPTY_WORLD_FILTERS, type WorldBrowserFilters } from './world-browser';
import { WorldComposer } from './world-composer';
import { WorldDashboard } from './world-dashboard';
import { WorldDetail } from './world-detail';
import { WorldInspector } from './world-inspector';
import { WorldRelationships } from './world-relationships';
import { isWorldPlace, narrowWorldEntities, type WorldEntityType } from './world';
import { useWorldEntities, useWorldEntity } from './use-world';

type WorkspaceTab = 'overview' | 'canon' | 'relationships';

/**
 * The World workspace: a dashboard of the setting, a browser and detail
 * surface for the piece of it in hand, and the relationship view that asks
 * what each place is actually for (UX spec, "World").
 *
 * Every panel, card and edge here is a canonical entity or relationship. The
 * eight kinds of world object share one detail surface rather than eight, and
 * the type is a filter in the browser rather than a tab of its own — the
 * dashboard is what gives each kind its named place.
 */
export function WorldWorkspace({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [filters, setFilters] = useState<WorldBrowserFilters>(EMPTY_WORLD_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerType, setComposerType] = useState<WorldEntityType>('region');

  const debouncedSearch = useDebouncedValue(filters.search, 250);
  const browseQuery = useWorldEntities(projectId, {
    lifecycle: filters.lifecycle,
    search: debouncedSearch.trim() || undefined,
  });
  // The dashboard and the relationship view read the setting as it stands,
  // never through whatever the browser is currently filtered down to.
  const worldQuery = useWorldEntities(projectId, { lifecycle: 'active' });
  const selectedQuery = useWorldEntity(projectId, selectedId);

  const visible = useMemo(
    () =>
      narrowWorldEntities(browseQuery.data?.items ?? [], {
        type: filters.type || undefined,
        canonStatus: filters.canonStatus || undefined,
        tag: filters.tag || undefined,
      }),
    [browseQuery.data, filters.type, filters.canonStatus, filters.tag],
  );

  const world = useMemo(() => worldQuery.data?.items ?? [], [worldQuery.data]);
  const places = useMemo(() => world.filter(isWorldPlace), [world]);

  function select(entity: Entity) {
    setSelectedId(entity.id);
    setTab('canon');
  }

  function compose(type: WorldEntityType) {
    setComposerType(type);
    setSelectedId(null);
    setTab('canon');
  }

  function browseBy(patch: Partial<WorldBrowserFilters>) {
    setFilters({ ...EMPTY_WORLD_FILTERS, lifecycle: filters.lifecycle, ...patch });
    setTab('canon');
  }

  const selected = selectedQuery.data ?? null;

  return (
    <WorkspacePage
      title="World"
      description="Places, people and history — the setting as connected canon rather than one long wiki."
      actions={
        <Button onClick={() => compose(composerType)}>
          <PlusIcon className="size-4" />
          New world entity
        </Button>
      }
      toolbar={
        <Tabs
          value={tab}
          onChange={(value) => setTab(value as WorkspaceTab)}
          items={[
            { value: 'overview', label: 'Overview' },
            { value: 'canon', label: 'Canon' },
            { value: 'relationships', label: 'Relationships' },
          ]}
        />
      }
      inspector={
        selected ? (
          <WorldInspector
            projectId={projectId}
            entity={selected}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <Inspector title="New world entity" description="World">
            <WorldComposer
              key={composerType}
              projectId={projectId}
              type={composerType}
              onCreated={select}
            />
          </Inspector>
        )
      }
    >
      {tab === 'overview' && (
        <WorldDashboard
          entities={world}
          isPending={worldQuery.isPending}
          error={worldQuery.error}
          onRetry={() => void worldQuery.refetch()}
          onSelect={select}
          onBrowseType={(type) => browseBy({ type })}
          onBrowseTag={(tag) => browseBy({ tag })}
          onCreate={compose}
        />
      )}

      {tab === 'relationships' && (
        <WorldRelationships
          projectId={projectId}
          places={places}
          selectedId={selectedId}
          onSelect={(entity) => setSelectedId(entity.id)}
        />
      )}

      {tab === 'canon' && (
        <>
          <WorldBrowser
            entities={visible}
            isPending={browseQuery.isPending}
            error={browseQuery.error}
            onRetry={() => void browseQuery.refetch()}
            filters={filters}
            onFiltersChange={setFilters}
            selectedId={selectedId}
            onSelect={select}
            onCreate={() => compose(composerType)}
          />

          <WorldDetailPane
            projectId={projectId}
            entity={selected}
            isPending={Boolean(selectedId) && selectedQuery.isPending}
            error={selectedQuery.error}
            onOpenReference={select}
          />
        </>
      )}
    </WorkspacePage>
  );
}

function WorldDetailPane({
  projectId,
  entity,
  isPending,
  error,
  onOpenReference,
}: {
  projectId: string;
  entity: Entity | null;
  isPending: boolean;
  error: unknown;
  onOpenReference: (referenced: Entity) => void;
}) {
  if (isPending) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error != null) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center p-5">
        <EmptyState title="Couldn't load this" description={apiErrorMessage(error)} />
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center p-5">
        <EmptyState
          title="Nothing selected"
          description="Pick a place, a faction or a piece of history to edit its canon and its lore — or start a new one from the panel on the right."
        />
      </div>
    );
  }

  return (
    <WorldDetail
      key={entity.id}
      projectId={projectId}
      entity={entity}
      onOpenReference={onOpenReference}
    />
  );
}
