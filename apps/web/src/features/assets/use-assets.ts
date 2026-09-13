'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as api from '@/lib/api';

/** A number both grid and list views divide evenly, kept modest for a first page paint. */
export const ASSET_LIBRARY_PAGE_SIZE = 60;

const assetKeys = {
  library: (projectId: string, page: number) =>
    ['projects', projectId, 'assets', 'library', page] as const,
};

/**
 * One page of the whole project's asset library (#169/#170's read model) —
 * the same rows whichever presentation is on screen. The view switcher
 * changes how a page is drawn, never which assets are fetched or how many
 * exist in `total` (issue #171's acceptance criteria).
 *
 * `includeArchived: true` because this workspace has no filter UI yet (that
 * is #172) — the base view is "what do we have", archived included and
 * badged, rather than silently matching the API's default of hiding them.
 */
export function useAssetLibrary(projectId: string, page: number) {
  return useQuery({
    queryKey: assetKeys.library(projectId, page),
    queryFn: () =>
      api.listAssetLibrary(projectId, {
        includeArchived: true,
        limit: ASSET_LIBRARY_PAGE_SIZE,
        offset: page * ASSET_LIBRARY_PAGE_SIZE,
      }),
    enabled: Boolean(projectId),
    placeholderData: keepPreviousData,
  });
}
