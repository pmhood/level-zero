'use client';

import type { Asset, Generation } from '@level-zero/domain';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';

/** A number both grid and list views divide evenly, kept modest for a first page paint. */
export const ASSET_LIBRARY_PAGE_SIZE = 60;

/** How many re-rolls of one generation the inspector's lineage list reads. */
const REROLL_LIMIT = 20;

const assetKeys = {
  all: (projectId: string) => ['projects', projectId, 'assets'] as const,
  library: (projectId: string, page: number, params: api.ListAssetLibraryParams) =>
    ['projects', projectId, 'assets', 'library', page, params] as const,
  generation: (projectId: string, assetId: string) =>
    ['projects', projectId, 'assets', assetId, 'generation'] as const,
  lineage: (projectId: string, assetId: string, generationId: string | null) =>
    ['projects', projectId, 'assets', assetId, 'lineage', generationId ?? 'none'] as const,
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

/**
 * The generation that produced one asset, or null where nothing did.
 *
 * An asset carries no generation id of its own — provenance is read from the
 * generation side — so this is the listing narrowed to the one that named this
 * file as an output. Both sides of a comparison and every inspector tab share
 * the one cache entry.
 */
export function useAssetGeneration(projectId: string, assetId: string | null) {
  return useQuery({
    queryKey: assetKeys.generation(projectId, assetId ?? ''),
    queryFn: async (): Promise<Generation | null> => {
      const page = await api.listGenerationsForAsset(projectId, assetId as string);
      return page.items[0] ?? null;
    },
    enabled: Boolean(projectId) && Boolean(assetId),
  });
}

/** How another file relates to the one being inspected. */
export type AssetRelation = 'source' | 'derivative' | 'reroll';

export interface AssetRelative {
  relation: AssetRelation;
  asset: Asset;
}

/**
 * The files around this one: what it was derived from, what was derived from
 * it, and the other takes from the same line of generations.
 *
 * These are the only three lineages assets actually have
 * (`docs/decisions/asset-library-model.md` §7.2), and none of them is a
 * version chain — the list says which relation each row is rather than
 * numbering them.
 */
export function useAssetLineage(projectId: string, asset: Asset, generation: Generation | null) {
  return useQuery({
    queryKey: assetKeys.lineage(projectId, asset.id, generation?.id ?? null),
    queryFn: () => readLineage(projectId, asset, generation),
    enabled: Boolean(projectId),
  });
}

async function readLineage(
  projectId: string,
  asset: Asset,
  generation: Generation | null,
): Promise<AssetRelative[]> {
  const relatives: AssetRelative[] = [];

  if (asset.sourceAssetId) {
    relatives.push({
      relation: 'source',
      asset: await api.getAsset(projectId, asset.sourceAssetId),
    });
  }

  const derived = await api.listAssets(projectId, {
    sourceAssetId: asset.id,
    includeArchived: true,
  });
  for (const item of derived.items) {
    relatives.push({ relation: 'derivative', asset: item });
  }

  const rerolled = await rerollAssetIds(projectId, asset, generation);
  const rerolls = await Promise.all(rerolled.map((id) => api.getAsset(projectId, id)));
  for (const item of rerolls) {
    relatives.push({ relation: 'reroll', asset: item });
  }

  return relatives;
}

/**
 * The outputs of every generation on the same branch: the one this was a
 * re-roll of, and the ones re-rolled from it. Siblings, not successors — four
 * takes on a prompt are four candidates, which is what makes them worth
 * comparing.
 */
async function rerollAssetIds(
  projectId: string,
  asset: Asset,
  generation: Generation | null,
): Promise<string[]> {
  if (!generation) return [];

  const related: Generation[] = [];
  if (generation.parentGenerationId) {
    related.push(await api.getGeneration(projectId, generation.parentGenerationId));
  }
  const rerolls = await api.listGenerations(projectId, {
    parentGenerationId: generation.id,
    limit: REROLL_LIMIT,
  });
  related.push(...rerolls.items);

  const ids = new Set(related.flatMap((record) => record.outputAssetIds));
  ids.delete(asset.id);
  return [...ids];
}

export function useArchiveAsset(projectId: string) {
  return useAssetMutation(projectId, (assetId: string) => api.archiveAsset(projectId, assetId));
}

export function useRestoreAsset(projectId: string) {
  return useAssetMutation(projectId, (assetId: string) => api.restoreAsset(projectId, assetId));
}

/** Archiving changes what the listing, the badge and the lineage all say: re-read them together. */
function useAssetMutation(projectId: string, mutationFn: (assetId: string) => Promise<Asset>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.all(projectId) });
    },
  });
}
