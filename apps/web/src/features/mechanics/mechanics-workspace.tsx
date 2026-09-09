'use client';

import type { Entity } from '@level-zero/domain';
import { Button, EmptyState, Inspector, PlusIcon, Tabs, WorkspacePage } from '@level-zero/ui';
import { useMemo, useState } from 'react';

import { apiErrorMessage } from '@/lib/api';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { CoreLoopView } from './core-loop-view';
import { narrowMechanics } from './mechanic';
import {
  EMPTY_MECHANIC_FILTERS,
  MechanicBrowser,
  type MechanicBrowserFilters,
} from './mechanic-browser';
import { MechanicComposer } from './mechanic-composer';
import { MechanicDetail } from './mechanic-detail';
import { MechanicInspector } from './mechanic-inspector';
import { useMechanic, useMechanics } from './use-mechanics';

type WorkspaceTab = 'systems' | 'core-loop';

/**
 * The Mechanics workspace: a browser of the project's systems, the detail
 * surface for the one in hand, and an inspector for what it connects to and
 * what it has been (UX spec, "Mechanics").
 *
 * Everything here is a canonical entity. The workspace is a view over the
 * graph, never a second place mechanics live.
 */
export function MechanicsWorkspace({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<WorkspaceTab>('systems');
  const [filters, setFilters] = useState<MechanicBrowserFilters>(EMPTY_MECHANIC_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(filters.search, 250);
  const mechanicsQuery = useMechanics(projectId, {
    lifecycle: filters.lifecycle,
    search: debouncedSearch.trim() || undefined,
  });
  const selectedQuery = useMechanic(projectId, selectedId);

  const mechanics = useMemo(() => mechanicsQuery.data?.items ?? [], [mechanicsQuery.data]);
  const visible = useMemo(
    () =>
      narrowMechanics(mechanics, {
        area: filters.area || undefined,
        implementationStatus: filters.implementationStatus || undefined,
      }),
    [mechanics, filters.area, filters.implementationStatus],
  );

  function select(mechanic: Entity) {
    setSelectedId(mechanic.id);
  }

  const selected = selectedQuery.data ?? null;

  return (
    <WorkspacePage
      title="Mechanics"
      description="Turn design ideas into systems that can be tuned, linked and tested."
      actions={
        <Button onClick={() => setSelectedId(null)}>
          <PlusIcon className="size-4" />
          New mechanic
        </Button>
      }
      toolbar={
        <Tabs
          value={tab}
          onChange={(value) => setTab(value as WorkspaceTab)}
          items={[
            { value: 'systems', label: 'Systems' },
            { value: 'core-loop', label: 'Core Loop' },
          ]}
        />
      }
      inspector={
        selected ? (
          <MechanicInspector
            projectId={projectId}
            mechanic={selected}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <Inspector title="New mechanic" description="Mechanics">
            <MechanicComposer projectId={projectId} onCreated={select} />
          </Inspector>
        )
      }
    >
      {tab === 'core-loop' ? (
        <CoreLoopView
          projectId={projectId}
          loops={mechanics.filter((mechanic) => mechanic.type === 'system')}
          candidates={mechanics}
          selectedId={selectedId}
          onSelect={select}
        />
      ) : (
        <>
          <MechanicBrowser
            mechanics={visible}
            isPending={mechanicsQuery.isPending}
            error={mechanicsQuery.error}
            onRetry={() => void mechanicsQuery.refetch()}
            filters={filters}
            onFiltersChange={setFilters}
            selectedId={selectedId}
            onSelect={select}
            onCreate={() => setSelectedId(null)}
          />

          <MechanicDetailPane
            projectId={projectId}
            mechanic={selected}
            isPending={Boolean(selectedId) && selectedQuery.isPending}
            error={selectedQuery.error}
          />
        </>
      )}
    </WorkspacePage>
  );
}

function MechanicDetailPane({
  projectId,
  mechanic,
  isPending,
  error,
}: {
  projectId: string;
  mechanic: Entity | null;
  isPending: boolean;
  error: unknown;
}) {
  if (isPending) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading mechanic…</p>
      </div>
    );
  }

  if (error != null) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center p-5">
        <EmptyState title="Couldn't load this mechanic" description={apiErrorMessage(error)} />
      </div>
    );
  }

  if (!mechanic) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center p-5">
        <EmptyState
          title="Nothing selected"
          description="Pick a mechanic to see its rules, what it takes in and what it produces — or start a new one from the panel on the right."
        />
      </div>
    );
  }

  return <MechanicDetail key={mechanic.id} projectId={projectId} mechanic={mechanic} />;
}
