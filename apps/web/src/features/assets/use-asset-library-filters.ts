'use client';

import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  assetLibraryFiltersToSearchParams,
  DEFAULT_ASSET_LIBRARY_FILTERS,
  parseAssetLibraryFilters,
  type AssetLibraryFilters,
} from './asset-library-filters';

/**
 * The Asset Library toolbar's filter and sort state, kept in the URL query
 * string (issue #172's acceptance criteria) so a filtered view is linkable
 * and survives a reload.
 *
 * The URL is read once, on mount — a pasted link reproduces the view — and
 * every change after that is pushed back out with `router.replace`, which
 * updates the address bar without adding a history entry or a navigation.
 * State lives in `useState` rather than being derived from `useSearchParams`
 * on every render: `useSearchParams` only changes on an actual navigation,
 * so a value this hook itself just wrote would not otherwise be reflected
 * back until the replace resolves.
 */
export function useAssetLibraryFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<AssetLibraryFilters>(() =>
    parseAssetLibraryFilters(searchParams),
  );

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const query = assetLibraryFiltersToSearchParams(filters).toString();
    router.replace((query ? `${pathname}?${query}` : pathname) as Route, { scroll: false });
  }, [filters, pathname, router]);

  function setFilter<K extends keyof AssetLibraryFilters>(key: K, value: AssetLibraryFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilter(key: keyof AssetLibraryFilters) {
    setFilters((current) => ({ ...current, [key]: DEFAULT_ASSET_LIBRARY_FILTERS[key] }));
  }

  function clearAll() {
    setFilters((current) => ({ ...DEFAULT_ASSET_LIBRARY_FILTERS, sort: current.sort }));
  }

  return { filters, setFilter, clearFilter, clearAll };
}
