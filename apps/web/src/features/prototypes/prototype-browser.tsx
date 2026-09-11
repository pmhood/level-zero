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

import { entityStatusBadge, entityTypeLabel } from '@/features/entities/entity-presentation';
import { apiErrorMessage } from '@/lib/api';

import type { PrototypeFilters } from './use-prototypes';

export const EMPTY_PROTOTYPE_FILTERS: PrototypeFilters = { lifecycle: 'active', search: '' };

function isFiltered(filters: PrototypeFilters): boolean {
  return (filters.search ?? '').trim().length > 0;
}

function FilterBar({
  filters,
  onChange,
}: {
  filters: PrototypeFilters;
  onChange: (filters: PrototypeFilters) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SearchField
        label="Search prototypes"
        placeholder="Search prototypes…"
        value={filters.search ?? ''}
        onChange={(event) => onChange({ ...filters, search: event.target.value })}
      />

      <Select
        aria-label="Filter by lifecycle"
        value={filters.lifecycle}
        onChange={(event) =>
          onChange({ ...filters, lifecycle: event.target.value as PrototypeFilters['lifecycle'] })
        }
      >
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </Select>
    </div>
  );
}

export interface PrototypeBrowserProps {
  prototypes: Entity[];
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  filters: PrototypeFilters;
  onFiltersChange: (filters: PrototypeFilters) => void;
  selectedId: string | null;
  onSelect: (prototype: Entity) => void;
}

/** Browse the project's prototypes, then pick one to review or iterate on. */
export function PrototypeBrowser({
  prototypes,
  isPending,
  error,
  onRetry,
  filters,
  onFiltersChange,
  selectedId,
  onSelect,
}: PrototypeBrowserProps) {
  return (
    <WorkspaceBrowser
      label="Prototypes"
      toolbar={<FilterBar filters={filters} onChange={onFiltersChange} />}
      footer={
        <p className="text-xs text-faint-foreground">
          {isPending || error ? ' ' : `${prototypes.length} shown`}
        </p>
      }
    >
      {isPending && (
        <div role="status" aria-label="Loading prototypes" className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <EntityCardSkeleton key={index} />
          ))}
        </div>
      )}

      {!isPending && error != null && (
        <EmptyState
          title="Couldn't load prototypes"
          description={apiErrorMessage(error)}
          actions={
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      )}

      {!isPending && error == null && prototypes.length === 0 && (
        <PrototypeBrowserEmptyState filters={filters} />
      )}

      {!isPending && error == null && prototypes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {prototypes.map((prototype) => (
            <li key={prototype.id}>
              <EntityCard
                name={prototype.name}
                typeLabel={entityTypeLabel(prototype.type)}
                status={entityStatusBadge(prototype.status)}
                description={prototype.description}
                tags={prototype.tags}
                selected={prototype.id === selectedId}
                onClick={() => onSelect(prototype)}
              />
            </li>
          ))}
        </ul>
      )}
    </WorkspaceBrowser>
  );
}

function PrototypeBrowserEmptyState({ filters }: { filters: PrototypeFilters }) {
  if (filters.lifecycle === 'archived') {
    return (
      <EmptyState
        title="No archived prototypes"
        description="Prototypes you archive stay here with their version history, ready to restore."
      />
    );
  }

  if (isFiltered(filters)) {
    return (
      <EmptyState
        title="No prototypes match this search"
        description="Try a different search term, or check the Archived filter."
      />
    );
  }

  return (
    <EmptyState
      title="No prototypes yet"
      description="Prototype a mechanic, system or scene to start one — the Prototype this action pins its current version as the first build to play."
    />
  );
}
