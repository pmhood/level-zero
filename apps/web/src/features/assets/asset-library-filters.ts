import {
  ASSET_KINDS,
  ASSET_MARK_KINDS,
  ASSET_ORIGINS,
  ASSET_PIPELINE_STAGES,
  ASSET_SELECTION_STATES,
  type AssetKind,
  type AssetMarkKind,
  type AssetOrigin,
  type AssetPipelineStage,
  type AssetSelectionState,
} from '@level-zero/domain';

import type { ListAssetLibraryParams } from '@/lib/api';

/**
 * The library's four named sorts (issue #172's acceptance criteria) over the
 * fields #169 exposes on `AssetListFilter` — one option per named sort
 * rather than a raw `sortBy`/`sortDirection` pair, so the toolbar offers
 * "Newest" instead of asking a user to pick a field and a direction apart.
 */
export const ASSET_SORT_OPTIONS = ['newest', 'updated', 'filename', 'size'] as const;
export type AssetSortOption = (typeof ASSET_SORT_OPTIONS)[number];

export const ASSET_SORT_LABELS: Record<AssetSortOption, string> = {
  newest: 'Newest',
  updated: 'Recently updated',
  filename: 'Filename (A–Z)',
  size: 'Size (largest first)',
};

const SORT_TO_LIST_PARAMS: Record<
  AssetSortOption,
  Pick<ListAssetLibraryParams, 'sortBy' | 'sortDirection'>
> = {
  newest: { sortBy: 'createdAt', sortDirection: 'desc' },
  updated: { sortBy: 'updatedAt', sortDirection: 'desc' },
  filename: { sortBy: 'filename', sortDirection: 'asc' },
  size: { sortBy: 'byteSize', sortDirection: 'desc' },
};

/**
 * The MIME families worth offering (issue body: "MIME family"). Not an enum
 * the server defines — `mimeFamily` is a free prefix match against
 * `mimeType` — so this is the toolbar's own, deliberately short, list of the
 * families this project's assets actually come in.
 */
export const MIME_FAMILY_OPTIONS = ['image', 'video', 'audio', 'application'] as const;
export type MimeFamilyOption = (typeof MIME_FAMILY_OPTIONS)[number];

export const MIME_FAMILY_LABELS: Record<MimeFamilyOption, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  application: 'Document/other',
};

function isMimeFamilyOption(value: string): value is MimeFamilyOption {
  return (MIME_FAMILY_OPTIONS as readonly string[]).includes(value);
}

/**
 * The toolbar's whole state (issue #172): every filter, the search text and
 * the chosen sort, kept as one plain object so it can be parsed from and
 * serialised back to the URL query string in one place.
 */
export interface AssetLibraryFilters {
  search: string;
  kind: AssetKind | null;
  mimeFamily: MimeFamilyOption | null;
  origin: AssetOrigin | null;
  markKind: AssetMarkKind | null;
  selectionState: AssetSelectionState | null;
  linkedEntityId: string | null;
  /** Set by clicking a stage in the Asset Pipeline strip (#230), never a toolbar dropdown. */
  pipelineStage: AssetPipelineStage | null;
  /** The collection to narrow by, server-side — the toolbar's All Collections control (#228). */
  collectionId: string | null;
  /** ISO calendar date (`yyyy-mm-dd`), as an `<input type="date">` gives it. */
  createdAfter: string | null;
  /** ISO calendar date (`yyyy-mm-dd`), inclusive — the exclusive-bound math lives in `toListParams`. */
  createdBefore: string | null;
  includeArchived: boolean;
  sort: AssetSortOption;
}

export const DEFAULT_ASSET_LIBRARY_FILTERS: AssetLibraryFilters = {
  search: '',
  kind: null,
  mimeFamily: null,
  origin: null,
  markKind: null,
  selectionState: null,
  linkedEntityId: null,
  pipelineStage: null,
  collectionId: null,
  createdAfter: null,
  createdBefore: null,
  includeArchived: false,
  sort: 'newest',
};

function enumOrNull<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Reads the toolbar's state back out of a URL query string, defaulting whatever is missing or malformed. */
export function parseAssetLibraryFilters(searchParams: URLSearchParams): AssetLibraryFilters {
  const mimeFamily = searchParams.get('mime');
  const sort = searchParams.get('sort');

  return {
    search: searchParams.get('q') ?? DEFAULT_ASSET_LIBRARY_FILTERS.search,
    kind: enumOrNull(searchParams.get('kind'), ASSET_KINDS),
    mimeFamily: mimeFamily !== null && isMimeFamilyOption(mimeFamily) ? mimeFamily : null,
    origin: enumOrNull(searchParams.get('origin'), ASSET_ORIGINS),
    markKind: enumOrNull(searchParams.get('mark'), ASSET_MARK_KINDS),
    selectionState: enumOrNull(searchParams.get('selection'), ASSET_SELECTION_STATES),
    linkedEntityId: searchParams.get('linkedEntityId'),
    pipelineStage: enumOrNull(searchParams.get('stage'), ASSET_PIPELINE_STAGES),
    collectionId: searchParams.get('collectionId'),
    createdAfter: searchParams.get('createdAfter'),
    createdBefore: searchParams.get('createdBefore'),
    includeArchived: searchParams.get('archived') === '1',
    sort:
      sort !== null && (ASSET_SORT_OPTIONS as readonly string[]).includes(sort)
        ? (sort as AssetSortOption)
        : DEFAULT_ASSET_LIBRARY_FILTERS.sort,
  };
}

/** Writes the toolbar's state into a URL query string, omitting anything at its default so a plain view stays a plain URL. */
export function assetLibraryFiltersToSearchParams(filters: AssetLibraryFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.search) params.set('q', filters.search);
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.mimeFamily) params.set('mime', filters.mimeFamily);
  if (filters.origin) params.set('origin', filters.origin);
  if (filters.markKind) params.set('mark', filters.markKind);
  if (filters.selectionState) params.set('selection', filters.selectionState);
  if (filters.linkedEntityId) params.set('linkedEntityId', filters.linkedEntityId);
  if (filters.pipelineStage) params.set('stage', filters.pipelineStage);
  if (filters.collectionId) params.set('collectionId', filters.collectionId);
  if (filters.createdAfter) params.set('createdAfter', filters.createdAfter);
  if (filters.createdBefore) params.set('createdBefore', filters.createdBefore);
  if (filters.includeArchived) params.set('archived', '1');
  if (filters.sort !== DEFAULT_ASSET_LIBRARY_FILTERS.sort) params.set('sort', filters.sort);

  return params;
}

/** The day after `date` (`yyyy-mm-dd` in, `yyyy-mm-dd` out), so an inclusive end date survives `createdBefore` being exclusive. */
function dayAfter(date: string): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * Every one of these fields round-trips to the server (settled scope: no
 * filter here narrows an already-fetched page) — this is purely the
 * translation from the toolbar's vocabulary to `AssetLibraryFilter`'s.
 */
export function assetLibraryFiltersToListParams(
  filters: AssetLibraryFilters,
): ListAssetLibraryParams {
  const sort = SORT_TO_LIST_PARAMS[filters.sort];

  return {
    search: filters.search.trim() || undefined,
    kind: filters.kind ? [filters.kind] : undefined,
    mimeFamily: filters.mimeFamily ? [filters.mimeFamily] : undefined,
    origin: filters.origin ?? undefined,
    markKinds: filters.markKind ? [filters.markKind] : undefined,
    selectionStates: filters.selectionState ? [filters.selectionState] : undefined,
    linkedEntityId: filters.linkedEntityId ?? undefined,
    pipelineStages: filters.pipelineStage ? [filters.pipelineStage] : undefined,
    collectionId: filters.collectionId ?? undefined,
    createdAfter: filters.createdAfter ?? undefined,
    createdBefore: filters.createdBefore ? dayAfter(filters.createdBefore) : undefined,
    includeArchived: filters.includeArchived,
    ...sort,
  };
}

/** Whether anything narrows the result set beyond the plain, unfiltered library — the empty-state and clear-all's question. */
export function hasActiveAssetLibraryFilters(filters: AssetLibraryFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.kind !== null ||
    filters.mimeFamily !== null ||
    filters.origin !== null ||
    filters.markKind !== null ||
    filters.selectionState !== null ||
    filters.linkedEntityId !== null ||
    filters.pipelineStage !== null ||
    filters.collectionId !== null ||
    filters.createdAfter !== null ||
    filters.createdBefore !== null ||
    filters.includeArchived
  );
}
