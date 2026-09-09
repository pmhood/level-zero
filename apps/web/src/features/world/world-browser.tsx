'use client';

import type { Entity } from '@level-zero/domain';
import {
  Button,
  EmptyState,
  EntityCard,
  EntityCardSkeleton,
  SearchField,
  Select,
  Tag,
  WorkspaceBrowser,
} from '@level-zero/ui';

import { entityTypeLabel } from '@/features/entities/entity-presentation';
import { apiErrorMessage } from '@/lib/api';

import {
  CANON_STATUSES,
  WORLD_ENTITY_TYPES,
  canonStatusBadge,
  readWorld,
  riskLabel,
  type CanonStatus,
  type WorldEntityType,
} from './world';
import type { WorldLifecycle } from './use-world';

export interface WorldBrowserFilters {
  search: string;
  type: WorldEntityType | '';
  canonStatus: CanonStatus | '';
  tag: string;
  lifecycle: WorldLifecycle;
}

export const EMPTY_WORLD_FILTERS: WorldBrowserFilters = {
  search: '',
  type: '',
  canonStatus: '',
  tag: '',
  lifecycle: 'active',
};

export function isFiltered(filters: WorldBrowserFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.type !== '' ||
    filters.canonStatus !== '' ||
    filters.tag !== ''
  );
}

function FilterBar({
  filters,
  onChange,
}: {
  filters: WorldBrowserFilters;
  onChange: (filters: WorldBrowserFilters) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SearchField
        label="Search the world"
        placeholder="Search places, factions, lore…"
        value={filters.search}
        onChange={(event) => onChange({ ...filters, search: event.target.value })}
      />

      <div className="grid grid-cols-2 gap-2">
        <Select
          aria-label="Filter by kind"
          value={filters.type}
          onChange={(event) =>
            onChange({ ...filters, type: event.target.value as WorldEntityType | '' })
          }
        >
          <option value="">Everything</option>
          {WORLD_ENTITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {entityTypeLabel(type)}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Filter by canon status"
          value={filters.canonStatus}
          onChange={(event) =>
            onChange({ ...filters, canonStatus: event.target.value as CanonStatus | '' })
          }
        >
          <option value="">Any canon status</option>
          {CANON_STATUSES.map((status) => (
            <option key={status} value={status}>
              {canonStatusBadge(status).label}
            </option>
          ))}
        </Select>
      </div>

      <Select
        aria-label="Filter by lifecycle"
        value={filters.lifecycle}
        onChange={(event) =>
          onChange({ ...filters, lifecycle: event.target.value as WorldLifecycle })
        }
      >
        <option value="active">In the setting</option>
        <option value="archived">Archived</option>
      </Select>

      {filters.tag && <Tag onRemove={() => onChange({ ...filters, tag: '' })}>{filters.tag}</Tag>}
    </div>
  );
}

export interface WorldBrowserProps {
  entities: Entity[];
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  filters: WorldBrowserFilters;
  onFiltersChange: (filters: WorldBrowserFilters) => void;
  selectedId: string | null;
  onSelect: (entity: Entity) => void;
  onCreate: () => void;
}

/** The list half of the workspace: narrow the setting, then pick something to work on. */
export function WorldBrowser({
  entities,
  isPending,
  error,
  onRetry,
  filters,
  onFiltersChange,
  selectedId,
  onSelect,
  onCreate,
}: WorldBrowserProps) {
  return (
    <WorkspaceBrowser
      label="World canon"
      toolbar={<FilterBar filters={filters} onChange={onFiltersChange} />}
      footer={
        <p className="text-xs text-faint-foreground">
          {isPending || error ? ' ' : `${entities.length} shown`}
        </p>
      }
    >
      {isPending && (
        <div role="status" aria-label="Loading the world" className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <EntityCardSkeleton key={index} />
          ))}
        </div>
      )}

      {!isPending && error != null && (
        <EmptyState
          title="Couldn't load the world"
          description={apiErrorMessage(error)}
          actions={
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      )}

      {!isPending && error == null && entities.length === 0 && (
        <WorldBrowserEmptyState filters={filters} onCreate={onCreate} />
      )}

      {!isPending && error == null && entities.length > 0 && (
        <ul className="flex flex-col gap-2">
          {entities.map((entity) => {
            const { canonStatus, risk, era } = readWorld(entity);
            return (
              <li key={entity.id}>
                <EntityCard
                  name={entity.name}
                  typeLabel={
                    era ? `${entityTypeLabel(entity.type)} · ${era}` : entityTypeLabel(entity.type)
                  }
                  status={canonStatusBadge(canonStatus)}
                  description={entity.description}
                  tags={entity.tags}
                  selected={entity.id === selectedId}
                  onClick={() => onSelect(entity)}
                  footer={risk !== 'none' ? <Tag>{riskLabel(risk)}</Tag> : undefined}
                />
              </li>
            );
          })}
        </ul>
      )}
    </WorkspaceBrowser>
  );
}

function WorldBrowserEmptyState({
  filters,
  onCreate,
}: {
  filters: WorldBrowserFilters;
  onCreate: () => void;
}) {
  if (filters.lifecycle === 'archived') {
    return (
      <EmptyState
        title="Nothing archived"
        description="Parts of the setting you archive stay here with their links and history, ready to restore."
      />
    );
  }

  if (isFiltered(filters)) {
    return (
      <EmptyState
        title="Nothing in the world matches these filters"
        description="Try a different search term, or widen the kind and canon filters."
      />
    );
  }

  return (
    <EmptyState
      title="The world is empty"
      description="Start with one place the game happens in, and the people who want it."
      actions={
        <Button size="sm" onClick={onCreate}>
          Create world entity
        </Button>
      }
    />
  );
}
