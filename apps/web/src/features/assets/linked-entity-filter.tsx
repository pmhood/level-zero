'use client';

import { Field, Input } from '@level-zero/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { EntityOptionList } from '@/features/entities/entity-option-list';
import { useEntity } from '@/features/entities/use-entities';
import * as api from '@/lib/api';
import { useDebouncedValue } from '@/lib/use-debounced-value';

/**
 * "Linked entity" (issue #172's filter list): narrows the library to assets
 * reachable from one entity, via `AssetLibraryFilter.linkedEntityId`.
 *
 * There is no reusable entity combobox in `packages/ui` yet (only the `@`
 * mention/embed picker, which is editor-specific) — this reuses that
 * picker's list, `EntityOptionList`, over a plain project-wide name search
 * rather than the mention picker's narrower `REFERENCEABLE_ENTITY_TYPES`,
 * since an asset can be linked from any entity type.
 */
export function LinkedEntityFilter({
  projectId,
  entityId,
  onChange,
}: {
  projectId: string;
  entityId: string | null;
  onChange: (entityId: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 250);

  const selectedQuery = useEntity(projectId, entityId ?? '');
  const searchQuery = useQuery({
    queryKey: ['projects', projectId, 'entities', 'search', debouncedQuery],
    queryFn: () => api.listEntities(projectId, { search: debouncedQuery, limit: 8 }),
    enabled: Boolean(projectId) && open && debouncedQuery.trim().length > 0,
  });

  if (entityId) {
    return (
      <Field label="Linked entity">
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Clear linked entity filter (${selectedQuery.data?.name ?? entityId})`}
          className="flex h-[34px] w-full items-center justify-between rounded-md border border-border bg-raised px-3 text-left text-sm text-foreground"
        >
          <span className="truncate">{selectedQuery.data?.name ?? entityId}</span>
          <span aria-hidden className="text-faint-foreground">
            ×
          </span>
        </button>
      </Field>
    );
  }

  return (
    <Field label="Linked entity" htmlFor="asset-filter-linked-entity" className="relative">
      <Input
        id="asset-filter-linked-entity"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search entities…"
      />
      {open && debouncedQuery.trim() && (
        <div className="absolute top-full left-0 z-10 mt-1 w-64 rounded-md border border-border-subtle bg-surface py-1 shadow-md">
          <EntityOptionList
            label="Matching entities"
            entities={searchQuery.data?.items ?? []}
            emptyMessage={searchQuery.isPending ? 'Searching…' : 'No matching entities'}
            onSelect={(entity) => {
              onChange(entity.id);
              setQuery('');
              setOpen(false);
            }}
          />
        </div>
      )}
    </Field>
  );
}
