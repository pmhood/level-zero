'use client';

import type { Entity } from '@level-zero/domain';
import {
  Button,
  EmptyState,
  EntityCard,
  EntityCardSkeleton,
  SearchField,
  Select,
  WorkspaceBrowser,
} from '@level-zero/ui';

import { entityTypeLabel } from '@/features/entities/entity-presentation';
import { apiErrorMessage } from '@/lib/api';

import {
  IMPLEMENTATION_STATUSES,
  MECHANIC_AREAS,
  implementationStatusBadge,
  mechanicAreaLabel,
  readMechanic,
  type ImplementationStatus,
  type MechanicArea,
} from './mechanic';
import type { MechanicLifecycle } from './use-mechanics';

export interface MechanicBrowserFilters {
  search: string;
  area: MechanicArea | '';
  implementationStatus: ImplementationStatus | '';
  lifecycle: MechanicLifecycle;
}

export const EMPTY_MECHANIC_FILTERS: MechanicBrowserFilters = {
  search: '',
  area: '',
  implementationStatus: '',
  lifecycle: 'active',
};

export function isFiltered(filters: MechanicBrowserFilters): boolean {
  return (
    filters.search.trim().length > 0 || filters.area !== '' || filters.implementationStatus !== ''
  );
}

function FilterBar({
  filters,
  onChange,
}: {
  filters: MechanicBrowserFilters;
  onChange: (filters: MechanicBrowserFilters) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SearchField
        label="Search mechanics"
        placeholder="Search mechanics…"
        value={filters.search}
        onChange={(event) => onChange({ ...filters, search: event.target.value })}
      />

      <div className="grid grid-cols-2 gap-2">
        <Select
          aria-label="Filter by area"
          value={filters.area}
          onChange={(event) =>
            onChange({ ...filters, area: event.target.value as MechanicArea | '' })
          }
        >
          <option value="">All areas</option>
          {MECHANIC_AREAS.map((area) => (
            <option key={area} value={area}>
              {mechanicAreaLabel(area)}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Filter by implementation status"
          value={filters.implementationStatus}
          onChange={(event) =>
            onChange({
              ...filters,
              implementationStatus: event.target.value as ImplementationStatus | '',
            })
          }
        >
          <option value="">Any progress</option>
          {IMPLEMENTATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {implementationStatusBadge(status).label}
            </option>
          ))}
        </Select>
      </div>

      <Select
        aria-label="Filter by lifecycle"
        value={filters.lifecycle}
        onChange={(event) =>
          onChange({ ...filters, lifecycle: event.target.value as MechanicLifecycle })
        }
      >
        <option value="active">In the design</option>
        <option value="archived">Archived</option>
      </Select>
    </div>
  );
}

export interface MechanicBrowserProps {
  mechanics: Entity[];
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  filters: MechanicBrowserFilters;
  onFiltersChange: (filters: MechanicBrowserFilters) => void;
  selectedId: string | null;
  onSelect: (mechanic: Entity) => void;
  onCreate: () => void;
}

/** The list half of the workspace: filter, then pick something to work on. */
export function MechanicBrowser({
  mechanics,
  isPending,
  error,
  onRetry,
  filters,
  onFiltersChange,
  selectedId,
  onSelect,
  onCreate,
}: MechanicBrowserProps) {
  return (
    <WorkspaceBrowser
      label="Mechanics"
      toolbar={<FilterBar filters={filters} onChange={onFiltersChange} />}
      footer={
        <p className="text-xs text-faint-foreground">
          {isPending || error ? ' ' : `${mechanics.length} shown`}
        </p>
      }
    >
      {isPending && (
        <div role="status" aria-label="Loading mechanics" className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <EntityCardSkeleton key={index} />
          ))}
        </div>
      )}

      {!isPending && error != null && (
        <EmptyState
          title="Couldn't load mechanics"
          description={apiErrorMessage(error)}
          actions={
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      )}

      {!isPending && error == null && mechanics.length === 0 && (
        <MechanicBrowserEmptyState filters={filters} onCreate={onCreate} />
      )}

      {!isPending && error == null && mechanics.length > 0 && (
        <ul className="flex flex-col gap-2">
          {mechanics.map((mechanic) => {
            const { area, implementationStatus } = readMechanic(mechanic);
            return (
              <li key={mechanic.id}>
                <EntityCard
                  name={mechanic.name}
                  typeLabel={`${entityTypeLabel(mechanic.type)} · ${mechanicAreaLabel(area)}`}
                  status={implementationStatusBadge(implementationStatus)}
                  description={mechanic.description}
                  tags={mechanic.tags}
                  selected={mechanic.id === selectedId}
                  onClick={() => onSelect(mechanic)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </WorkspaceBrowser>
  );
}

function MechanicBrowserEmptyState({
  filters,
  onCreate,
}: {
  filters: MechanicBrowserFilters;
  onCreate: () => void;
}) {
  if (filters.lifecycle === 'archived') {
    return (
      <EmptyState
        title="No archived mechanics"
        description="Mechanics you archive stay here with their links and history, ready to restore."
      />
    );
  }

  if (isFiltered(filters)) {
    return (
      <EmptyState
        title="No mechanics match these filters"
        description="Try a different search term, or widen the area and progress filters."
      />
    );
  }

  return (
    <EmptyState
      title="No mechanics yet"
      description="Start with the player's core fantasy — what the game asks them to do, over and over."
      actions={
        <Button size="sm" onClick={onCreate}>
          Create mechanic
        </Button>
      }
    />
  );
}
