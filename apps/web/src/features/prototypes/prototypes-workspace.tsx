'use client';

import type { Entity } from '@level-zero/domain';
import { EmptyState, Inspector, WorkspacePage } from '@level-zero/ui';
import { useMemo, useState } from 'react';

import { useEntity } from '@/features/entities/use-entities';
import { apiErrorMessage } from '@/lib/api';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { EMPTY_PROTOTYPE_FILTERS, PrototypeBrowser } from './prototype-browser';
import { PrototypeDetail } from './prototype-detail';
import { PrototypeInspector } from './prototype-inspector';
import { usePrototypeEntities } from './use-prototypes';
import type { PrototypeFilters } from './use-prototypes';

/**
 * The Prototype workspace: run, review and iterate on playable prototypes
 * (UX spec, "Prototypes" — issue #64).
 *
 * Browsing follows the same three-zone shape as Characters and Mechanics —
 * a browser, a detail surface, an inspector — but what a prototype *is* is
 * its version history, not its own `data`, so the detail surface
 * (`PrototypeDetail`) owns version selection rather than this workspace.
 * That split is also what lets the same body render at the canonical entity
 * route (`ENTITY_DETAIL_BODIES.prototype`) without duplication.
 */
export function PrototypesWorkspace({ projectId }: { projectId: string }) {
  const [filters, setFilters] = useState<PrototypeFilters>(EMPTY_PROTOTYPE_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(filters.search ?? '', 250);
  const prototypesQuery = usePrototypeEntities(projectId, {
    lifecycle: filters.lifecycle,
    search: debouncedSearch.trim() || undefined,
  });
  const selectedQuery = useEntity(projectId, selectedId ?? '');

  const prototypes = useMemo(() => prototypesQuery.data?.items ?? [], [prototypesQuery.data]);

  function select(prototype: Entity) {
    setSelectedId(prototype.id);
  }

  const selected = selectedId ? (selectedQuery.data ?? null) : null;

  return (
    <WorkspacePage
      title="Prototypes"
      description="Run, review and iterate on playable experiments — pinned to the exact creative versions they were built from."
      inspector={
        selected ? (
          <PrototypeInspector
            projectId={projectId}
            prototype={selected}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <Inspector title="Prototypes" description="What can be done with the one you pick">
            <p className="text-sm text-muted-foreground">
              Select a prototype from the list to review its versions, playtests and playable build.
            </p>
          </Inspector>
        )
      }
    >
      <PrototypeBrowser
        prototypes={prototypes}
        isPending={prototypesQuery.isPending}
        error={prototypesQuery.error}
        onRetry={() => void prototypesQuery.refetch()}
        filters={filters}
        onFiltersChange={setFilters}
        selectedId={selectedId}
        onSelect={select}
      />

      <PrototypeDetailPane
        projectId={projectId}
        prototype={selected}
        isPending={Boolean(selectedId) && selectedQuery.isPending}
        error={selectedId ? selectedQuery.error : null}
      />
    </WorkspacePage>
  );
}

function PrototypeDetailPane({
  projectId,
  prototype,
  isPending,
  error,
}: {
  projectId: string;
  prototype: Entity | null;
  isPending: boolean;
  error: unknown;
}) {
  if (isPending) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading prototype…</p>
      </div>
    );
  }

  if (error != null) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center p-5">
        <EmptyState title="Couldn't load this prototype" description={apiErrorMessage(error)} />
      </div>
    );
  }

  if (!prototype) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center p-5">
        <EmptyState
          title="Nothing selected"
          description="Pick a prototype to see its playable build, what it pins and its playtests."
        />
      </div>
    );
  }

  return <PrototypeDetail key={prototype.id} projectId={projectId} prototype={prototype} />;
}
