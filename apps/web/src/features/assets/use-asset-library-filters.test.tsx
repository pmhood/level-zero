// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
let currentSearch = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/projects/prj_1/assets',
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

const { DEFAULT_ASSET_LIBRARY_FILTERS } = await import('./asset-library-filters');
const { useAssetLibraryFilters } = await import('./use-asset-library-filters');

beforeEach(() => {
  replace.mockClear();
  currentSearch = '';
});

describe('useAssetLibraryFilters', () => {
  it('reads its initial state from the URL, so a pasted link reproduces the view', () => {
    currentSearch = 'kind=image&archived=1';

    const { result } = renderHook(() => useAssetLibraryFilters());

    expect(result.current.filters.kind).toBe('image');
    expect(result.current.filters.includeArchived).toBe(true);
  });

  it('does not rewrite the URL on mount', () => {
    currentSearch = 'kind=image';

    renderHook(() => useAssetLibraryFilters());

    expect(replace).not.toHaveBeenCalled();
  });

  it('pushes a changed filter into the URL query string', () => {
    const { result } = renderHook(() => useAssetLibraryFilters());

    act(() => result.current.setFilter('kind', 'image'));

    expect(replace).toHaveBeenCalledWith('/projects/prj_1/assets?kind=image', { scroll: false });
  });

  it('drops the query string entirely once nothing is left to filter by', () => {
    currentSearch = 'kind=image';
    const { result } = renderHook(() => useAssetLibraryFilters());

    act(() => result.current.clearFilter('kind'));

    expect(replace).toHaveBeenCalledWith('/projects/prj_1/assets', { scroll: false });
  });

  it('clears one filter without disturbing the others', () => {
    currentSearch = 'kind=image&origin=generated';
    const { result } = renderHook(() => useAssetLibraryFilters());

    act(() => result.current.clearFilter('kind'));

    expect(replace).toHaveBeenLastCalledWith('/projects/prj_1/assets?origin=generated', {
      scroll: false,
    });
  });

  it('clears every filter on clearAll but leaves the chosen sort alone', () => {
    currentSearch = 'kind=image&sort=size';
    const { result } = renderHook(() => useAssetLibraryFilters());

    act(() => result.current.clearAll());

    expect(result.current.filters).toEqual({ ...DEFAULT_ASSET_LIBRARY_FILTERS, sort: 'size' });
  });
});
