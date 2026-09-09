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

import { entityStatusBadge } from '@/features/entities/entity-presentation';
import { apiErrorMessage } from '@/lib/api';

import {
  CHARACTER_LIFECYCLES,
  lifecycleLabel,
  readCharacter,
  type CharacterLifecycle,
} from './character';

export interface CharacterBrowserFilters {
  search: string;
  role: string;
  tag: string;
  lifecycle: CharacterLifecycle;
}

export const EMPTY_CHARACTER_FILTERS: CharacterBrowserFilters = {
  search: '',
  role: '',
  tag: '',
  lifecycle: 'cast',
};

/** Whether anything is narrowing the list — which empty state to show turns on it. */
function isFiltered(filters: CharacterBrowserFilters): boolean {
  return filters.search.trim().length > 0 || filters.role !== '' || filters.tag !== '';
}

function FilterBar({
  filters,
  roles,
  tags,
  onChange,
}: {
  filters: CharacterBrowserFilters;
  roles: string[];
  tags: string[];
  onChange: (filters: CharacterBrowserFilters) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SearchField
        label="Search characters"
        placeholder="Search characters…"
        value={filters.search}
        onChange={(event) => onChange({ ...filters, search: event.target.value })}
      />

      <div className="grid grid-cols-2 gap-2">
        <Select
          aria-label="Filter by role"
          value={filters.role}
          onChange={(event) => onChange({ ...filters, role: event.target.value })}
        >
          <option value="">All roles</option>
          {roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Filter by tag"
          value={filters.tag}
          onChange={(event) => onChange({ ...filters, tag: event.target.value })}
        >
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </Select>
      </div>

      <Select
        aria-label="Filter by status"
        value={filters.lifecycle}
        onChange={(event) =>
          onChange({ ...filters, lifecycle: event.target.value as CharacterLifecycle })
        }
      >
        {CHARACTER_LIFECYCLES.map((lifecycle) => (
          <option key={lifecycle} value={lifecycle}>
            {lifecycleLabel(lifecycle)}
          </option>
        ))}
      </Select>
    </div>
  );
}

export interface CharacterBrowserProps {
  characters: Entity[];
  roles: string[];
  tags: string[];
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  filters: CharacterBrowserFilters;
  onFiltersChange: (filters: CharacterBrowserFilters) => void;
  selectedId: string | null;
  onSelect: (character: Entity) => void;
  onCreate: () => void;
}

/** The list half of the studio: narrow the cast, then pick who to work on. */
export function CharacterBrowser({
  characters,
  roles,
  tags,
  isPending,
  error,
  onRetry,
  filters,
  onFiltersChange,
  selectedId,
  onSelect,
  onCreate,
}: CharacterBrowserProps) {
  return (
    <WorkspaceBrowser
      label="Characters"
      toolbar={<FilterBar filters={filters} roles={roles} tags={tags} onChange={onFiltersChange} />}
      footer={
        <p className="text-xs text-faint-foreground">
          {isPending || error ? ' ' : `${characters.length} shown`}
        </p>
      }
    >
      {isPending && (
        <div role="status" aria-label="Loading characters" className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <EntityCardSkeleton key={index} />
          ))}
        </div>
      )}

      {!isPending && error != null && (
        <EmptyState
          title="Couldn't load characters"
          description={apiErrorMessage(error)}
          actions={
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      )}

      {!isPending && error == null && characters.length === 0 && (
        <CharacterBrowserEmptyState filters={filters} onCreate={onCreate} />
      )}

      {!isPending && error == null && characters.length > 0 && (
        <ul className="flex flex-col gap-2">
          {characters.map((character) => {
            const { role } = readCharacter(character);
            return (
              <li key={character.id}>
                <EntityCard
                  name={character.name}
                  typeLabel={role || 'No role yet'}
                  status={entityStatusBadge(character.status)}
                  description={character.description}
                  tags={character.tags}
                  selected={character.id === selectedId}
                  onClick={() => onSelect(character)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </WorkspaceBrowser>
  );
}

function CharacterBrowserEmptyState({
  filters,
  onCreate,
}: {
  filters: CharacterBrowserFilters;
  onCreate: () => void;
}) {
  if (filters.lifecycle === 'archived') {
    return (
      <EmptyState
        title="No archived characters"
        description="Characters you archive stay here with their visuals, relationships and history, ready to restore."
      />
    );
  }

  if (isFiltered(filters)) {
    return (
      <EmptyState
        title="No characters match these filters"
        description="Try a different search term, or widen the role and tag filters."
      />
    );
  }

  return (
    <EmptyState
      title="No characters yet"
      description="People drive the story. Start with one — a name and what they do in the world is enough."
      actions={
        <Button size="sm" onClick={onCreate}>
          Create character
        </Button>
      }
    />
  );
}
