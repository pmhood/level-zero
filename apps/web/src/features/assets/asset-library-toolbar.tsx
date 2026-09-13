'use client';

import {
  ASSET_KINDS,
  ASSET_MARK_KINDS,
  ASSET_ORIGINS,
  ASSET_SELECTION_STATES,
  type AssetKind,
  type AssetMarkKind,
  type AssetOrigin,
  type AssetSelectionState,
} from '@level-zero/domain';
import { Button, Field, Input, SearchField, Select, Tag } from '@level-zero/ui';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

import { useEntity } from '@/features/entities/use-entities';
import { assetMarkLabel, assetSelectionBadge } from '@/features/selection/selection';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import {
  ASSET_SORT_LABELS,
  ASSET_SORT_OPTIONS,
  hasActiveAssetLibraryFilters,
  MIME_FAMILY_LABELS,
  MIME_FAMILY_OPTIONS,
  type AssetLibraryFilters,
  type AssetSortOption,
  type MimeFamilyOption,
} from './asset-library-filters';
import { assetKindLabel } from './asset-presentation';
import { LinkedEntityFilter } from './linked-entity-filter';

const ORIGIN_LABELS: Record<AssetOrigin, string> = {
  generated: 'Generated',
  imported: 'Imported',
};

const SEARCH_DEBOUNCE_MS = 300;

export interface AssetLibraryToolbarProps {
  projectId: string;
  filters: AssetLibraryFilters;
  setFilter: <K extends keyof AssetLibraryFilters>(key: K, value: AssetLibraryFilters[K]) => void;
  clearFilter: (key: keyof AssetLibraryFilters) => void;
  clearAll: () => void;
  /**
   * The workspace's view switcher (#171), rendered at the toolbar's trailing
   * edge — the mockup's single row — without this component needing to know
   * what a view is. Collections (#178) and Generate Asset (the generation
   * panel) get the same edge once they exist; this is only the slot.
   */
  viewSwitcher: ReactNode;
}

/**
 * The pinned toolbar above the grid/list (issue #172): every filter and
 * sort #169/#170/#200/#201/#202 expose, driving the same server-side query
 * `useAssetLibrary` runs — nothing here narrows an already-fetched page.
 *
 * Collections (#178) and Generate Asset (the generation panel) are named in
 * the mockup but not built here; this only leaves their layout position —
 * the toolbar's trailing edge, beside the view switcher `assets-workspace.tsx`
 * already renders — free for them to land in later.
 */
export function AssetLibraryToolbar({
  projectId,
  filters,
  setFilter,
  clearFilter,
  clearAll,
  viewSwitcher,
}: AssetLibraryToolbarProps) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);

  // The URL (a paste, a "clear" chip) is the source of truth for what is
  // typed, not just what was searched — this keeps the box in sync when
  // `filters.search` changes from outside a keystroke.
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  // Only the debounced value should re-trigger this; `filters.search` and
  // `setFilter` are deliberately left out of the dependency array, or every
  // keystroke's eventual commit would re-fire this effect a second time for
  // nothing.
  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilter('search', debouncedSearch);
  }, [debouncedSearch]);

  const active = hasActiveAssetLibraryFilters(filters);

  return (
    <div className="flex flex-col gap-3 border-b border-border-subtle py-3">
      <div className="flex flex-wrap items-end gap-3">
        <SearchField
          label="Search assets by filename"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search assets by filename…"
          className="w-full sm:w-64"
        />

        <Field label="Type" htmlFor="asset-filter-kind">
          <Select
            id="asset-filter-kind"
            value={filters.kind ?? ''}
            onChange={(event) => setFilter('kind', (event.target.value || null) as AssetKind | null)}
            className="w-36"
          >
            <option value="">All Types</option>
            {ASSET_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {assetKindLabel(kind)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Origin" htmlFor="asset-filter-origin">
          <Select
            id="asset-filter-origin"
            value={filters.origin ?? ''}
            onChange={(event) =>
              setFilter('origin', (event.target.value || null) as AssetOrigin | null)
            }
            className="w-32"
          >
            <option value="">All Origins</option>
            {ASSET_ORIGINS.map((origin) => (
              <option key={origin} value={origin}>
                {ORIGIN_LABELS[origin]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Sort" htmlFor="asset-filter-sort">
          <Select
            id="asset-filter-sort"
            value={filters.sort}
            onChange={(event) => setFilter('sort', event.target.value as AssetSortOption)}
            className="w-44"
          >
            {ASSET_SORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {ASSET_SORT_LABELS[option]}
              </option>
            ))}
          </Select>
        </Field>

        <Link
          href={`/projects/${projectId}/search?sourceType=asset` as Route}
          className="ml-auto self-center text-xs font-medium text-primary hover:underline"
        >
          Search inside assets →
        </Link>

        {viewSwitcher}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Format" htmlFor="asset-filter-mime">
          <Select
            id="asset-filter-mime"
            value={filters.mimeFamily ?? ''}
            onChange={(event) =>
              setFilter('mimeFamily', (event.target.value || null) as MimeFamilyOption | null)
            }
            className="w-36"
          >
            <option value="">All Formats</option>
            {MIME_FAMILY_OPTIONS.map((family) => (
              <option key={family} value={family}>
                {MIME_FAMILY_LABELS[family]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Marked" htmlFor="asset-filter-mark">
          <Select
            id="asset-filter-mark"
            value={filters.markKind ?? ''}
            onChange={(event) =>
              setFilter('markKind', (event.target.value || null) as AssetMarkKind | null)
            }
            className="w-36"
          >
            <option value="">Any mark</option>
            {ASSET_MARK_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {assetMarkLabel(kind)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Selection" htmlFor="asset-filter-selection">
          <Select
            id="asset-filter-selection"
            value={filters.selectionState ?? ''}
            onChange={(event) =>
              setFilter('selectionState', (event.target.value || null) as AssetSelectionState | null)
            }
            className="w-36"
          >
            <option value="">Any selection</option>
            {ASSET_SELECTION_STATES.map((state) => (
              <option key={state} value={state}>
                {assetSelectionBadge(state).label}
              </option>
            ))}
          </Select>
        </Field>

        <LinkedEntityFilter
          projectId={projectId}
          entityId={filters.linkedEntityId}
          onChange={(entityId) => setFilter('linkedEntityId', entityId)}
        />

        <Field label="Created after" htmlFor="asset-filter-created-after">
          <Input
            id="asset-filter-created-after"
            type="date"
            value={filters.createdAfter ?? ''}
            onChange={(event) => setFilter('createdAfter', event.target.value || null)}
            className="w-[152px]"
          />
        </Field>

        <Field label="Created before" htmlFor="asset-filter-created-before">
          <Input
            id="asset-filter-created-before"
            type="date"
            value={filters.createdBefore ?? ''}
            onChange={(event) => setFilter('createdBefore', event.target.value || null)}
            className="w-[152px]"
          />
        </Field>

        <label className="flex h-[34px] items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={filters.includeArchived}
            onChange={(event) => setFilter('includeArchived', event.target.checked)}
            className="size-4 rounded border-border-strong"
          />
          Include archived
        </label>
      </div>

      {active && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.search.trim() && (
            <Tag onRemove={() => clearFilter('search')}>{`Filename: "${filters.search.trim()}"`}</Tag>
          )}
          {filters.kind && (
            <Tag onRemove={() => clearFilter('kind')}>{`Type: ${assetKindLabel(filters.kind)}`}</Tag>
          )}
          {filters.mimeFamily && (
            <Tag onRemove={() => clearFilter('mimeFamily')}>
              {`Format: ${MIME_FAMILY_LABELS[filters.mimeFamily]}`}
            </Tag>
          )}
          {filters.origin && (
            <Tag onRemove={() => clearFilter('origin')}>{ORIGIN_LABELS[filters.origin]}</Tag>
          )}
          {filters.markKind && (
            <Tag onRemove={() => clearFilter('markKind')}>
              {`Marked: ${assetMarkLabel(filters.markKind)}`}
            </Tag>
          )}
          {filters.selectionState && (
            <Tag onRemove={() => clearFilter('selectionState')}>
              {assetSelectionBadge(filters.selectionState).label}
            </Tag>
          )}
          {filters.linkedEntityId && (
            <LinkedEntityTag
              projectId={projectId}
              entityId={filters.linkedEntityId}
              onRemove={() => clearFilter('linkedEntityId')}
            />
          )}
          {filters.createdAfter && (
            <Tag onRemove={() => clearFilter('createdAfter')}>{`From ${filters.createdAfter}`}</Tag>
          )}
          {filters.createdBefore && (
            <Tag onRemove={() => clearFilter('createdBefore')}>{`Until ${filters.createdBefore}`}</Tag>
          )}
          {filters.includeArchived && (
            <Tag onRemove={() => clearFilter('includeArchived')}>Including archived</Tag>
          )}
          <Button variant="ghost" size="sm" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}

/** The linked-entity chip resolves its own label, the same way `LinkedEntityFilter` resolves its selected entity's name. */
function LinkedEntityTag({
  projectId,
  entityId,
  onRemove,
}: {
  projectId: string;
  entityId: string;
  onRemove: () => void;
}) {
  const entityQuery = useEntity(projectId, entityId);
  return <Tag onRemove={onRemove}>{`Linked to: ${entityQuery.data?.name ?? entityId}`}</Tag>;
}
