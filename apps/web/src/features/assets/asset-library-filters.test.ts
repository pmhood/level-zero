import { describe, expect, it } from 'vitest';

import {
  assetLibraryFiltersToListParams,
  assetLibraryFiltersToSearchParams,
  DEFAULT_ASSET_LIBRARY_FILTERS,
  hasActiveAssetLibraryFilters,
  parseAssetLibraryFilters,
  type AssetLibraryFilters,
} from './asset-library-filters';

function filters(overrides: Partial<AssetLibraryFilters> = {}): AssetLibraryFilters {
  return { ...DEFAULT_ASSET_LIBRARY_FILTERS, ...overrides };
}

describe('parseAssetLibraryFilters', () => {
  it('defaults every field when the query string is empty', () => {
    expect(parseAssetLibraryFilters(new URLSearchParams())).toEqual(DEFAULT_ASSET_LIBRARY_FILTERS);
  });

  it('reads every field back out of a query string (the URL round trip)', () => {
    const params = new URLSearchParams({
      q: 'kael',
      kind: 'image',
      mime: 'image',
      origin: 'generated',
      mark: 'favorite',
      selection: 'approved',
      linkedEntityId: 'ent_kael',
      stage: 'in_progress',
      collectionId: 'col_props',
      createdAfter: '2026-01-01',
      createdBefore: '2026-02-01',
      archived: '1',
      sort: 'filename',
    });

    expect(parseAssetLibraryFilters(params)).toEqual({
      search: 'kael',
      kind: 'image',
      mimeFamily: 'image',
      origin: 'generated',
      markKind: 'favorite',
      selectionState: 'approved',
      linkedEntityId: 'ent_kael',
      pipelineStage: 'in_progress',
      collectionId: 'col_props',
      createdAfter: '2026-01-01',
      createdBefore: '2026-02-01',
      includeArchived: true,
      sort: 'filename',
    });
  });

  it('falls back to the default rather than trusting an invalid enum value', () => {
    const params = new URLSearchParams({
      kind: 'not-a-kind',
      sort: 'not-a-sort',
      stage: 'approved_concept',
    });

    const result = parseAssetLibraryFilters(params);

    expect(result.kind).toBeNull();
    expect(result.sort).toBe('newest');
    expect(result.pipelineStage).toBeNull();
  });
});

describe('assetLibraryFiltersToSearchParams', () => {
  it('produces an empty query string for the default, unfiltered view', () => {
    expect(assetLibraryFiltersToSearchParams(DEFAULT_ASSET_LIBRARY_FILTERS).toString()).toBe('');
  });

  it('round-trips through parseAssetLibraryFilters', () => {
    const original = filters({
      search: 'crate',
      kind: 'model_3d',
      origin: 'imported',
      pipelineStage: 'production_ready',
      collectionId: 'col_props',
      includeArchived: true,
      sort: 'size',
    });

    const roundTripped = parseAssetLibraryFilters(assetLibraryFiltersToSearchParams(original));

    expect(roundTripped).toEqual(original);
  });
});

describe('assetLibraryFiltersToListParams', () => {
  it('sends nothing for a filter left at its default', () => {
    const params = assetLibraryFiltersToListParams(DEFAULT_ASSET_LIBRARY_FILTERS);

    expect(params).toMatchObject({
      search: undefined,
      kind: undefined,
      mimeFamily: undefined,
      origin: undefined,
      markKinds: undefined,
      selectionStates: undefined,
      linkedEntityId: undefined,
      pipelineStages: undefined,
      collectionId: undefined,
      createdAfter: undefined,
      includeArchived: false,
    });
  });

  it('maps each named sort to the field and direction #169 exposes', () => {
    expect(assetLibraryFiltersToListParams(filters({ sort: 'newest' }))).toMatchObject({
      sortBy: 'createdAt',
      sortDirection: 'desc',
    });
    expect(assetLibraryFiltersToListParams(filters({ sort: 'updated' }))).toMatchObject({
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    });
    expect(assetLibraryFiltersToListParams(filters({ sort: 'filename' }))).toMatchObject({
      sortBy: 'filename',
      sortDirection: 'asc',
    });
    expect(assetLibraryFiltersToListParams(filters({ sort: 'size' }))).toMatchObject({
      sortBy: 'byteSize',
      sortDirection: 'desc',
    });
  });

  it('wraps single-choice filters in the arrays the API filter expects', () => {
    const params = assetLibraryFiltersToListParams(
      filters({
        kind: 'image',
        mimeFamily: 'image',
        markKind: 'favorite',
        selectionState: 'approved',
        pipelineStage: 'in_progress',
      }),
    );

    expect(params.kind).toEqual(['image']);
    expect(params.mimeFamily).toEqual(['image']);
    expect(params.markKinds).toEqual(['favorite']);
    expect(params.selectionStates).toEqual(['approved']);
    expect(params.pipelineStages).toEqual(['in_progress']);
  });

  it('sends collectionId straight through, unwrapped — the read model takes one id, not an array', () => {
    const params = assetLibraryFiltersToListParams(filters({ collectionId: 'col_props' }));

    expect(params.collectionId).toBe('col_props');
  });

  it('pushes createdBefore one day out so the picked end date is included, not excluded', () => {
    const params = assetLibraryFiltersToListParams(filters({ createdBefore: '2026-03-15' }));

    expect(params.createdBefore).toBe('2026-03-16');
  });

  it('leaves createdAfter as the picked date, an inclusive lower bound already', () => {
    const params = assetLibraryFiltersToListParams(filters({ createdAfter: '2026-03-15' }));

    expect(params.createdAfter).toBe('2026-03-15');
  });
});

describe('hasActiveAssetLibraryFilters', () => {
  it('is false for the default view', () => {
    expect(hasActiveAssetLibraryFilters(DEFAULT_ASSET_LIBRARY_FILTERS)).toBe(false);
  });

  it('is false for whitespace-only search text', () => {
    expect(hasActiveAssetLibraryFilters(filters({ search: '   ' }))).toBe(false);
  });

  it('is true when any single field narrows the view', () => {
    expect(hasActiveAssetLibraryFilters(filters({ kind: 'image' }))).toBe(true);
    expect(hasActiveAssetLibraryFilters(filters({ includeArchived: true }))).toBe(true);
    expect(hasActiveAssetLibraryFilters(filters({ linkedEntityId: 'ent_1' }))).toBe(true);
    expect(hasActiveAssetLibraryFilters(filters({ pipelineStage: 'concept' }))).toBe(true);
    expect(hasActiveAssetLibraryFilters(filters({ collectionId: 'col_props' }))).toBe(true);
  });

  it('does not count sort alone as a narrowing filter', () => {
    expect(hasActiveAssetLibraryFilters(filters({ sort: 'size' }))).toBe(false);
  });
});
