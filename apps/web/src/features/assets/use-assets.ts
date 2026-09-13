'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as api from '@/lib/api';

/** A number both grid and list views divide evenly, kept modest for a first page paint. */
export const ASSET_LIBRARY_PAGE_SIZE = 60;

const assetKeys = {
  library: (projectId: string, page: number, params: api.ListAssetLibraryParams) =>
    ['projects', projectId, 'assets', 'library', page, params] as const,
};

/**
 * One page of the whole project's asset library (#169/#170's read model) —
 * the same rows whichever presentation is on screen. The view switcher
 * changes how a page is drawn, never which assets are fetched or how many
 * exist in `total` (issue #171's acceptance criteria).
 *
 * `params` is #172's toolbar state, translated to the API's filter and sort
 * fields — every one of them round-trips to the server, so a filtered count,
 * an empty page and an empty state all agree with the same query rather than
 * a client-side narrowing of an already-fetched page.
 */
export function useAssetLibrary(
  projectId: string,
  page: number,
  params: api.ListAssetLibraryParams = {},
) {
  return useQuery({
    queryKey: assetKeys.library(projectId, page, params),
    queryFn: () =>
      api.listAssetLibrary(projectId, {
        ...params,
        limit: ASSET_LIBRARY_PAGE_SIZE,
        offset: page * ASSET_LIBRARY_PAGE_SIZE,
      }),
    enabled: Boolean(projectId),
    placeholderData: keepPreviousData,
  });
}
