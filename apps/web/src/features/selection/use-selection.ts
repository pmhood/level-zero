'use client';

import type { AssetMarkKind, AssetSelectionContext } from '@level-zero/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';

/**
 * One project, one selection cache. A decision changes what is current for a
 * context, what the entity stands behind and what the asset's history says, so
 * all three invalidate together rather than being tracked apart.
 */
const selectionKeys = {
  all: (projectId: string) => ['projects', projectId, 'asset-selections'] as const,
  context: (projectId: string, context: AssetSelectionContext) =>
    [...selectionKeys.all(projectId), 'context', context.entityId, context.purpose] as const,
  entity: (projectId: string, entityId: string) =>
    [...selectionKeys.all(projectId), 'entity', entityId] as const,
  asset: (projectId: string, assetId: string) =>
    [...selectionKeys.all(projectId), 'asset', assetId] as const,
  marks: (projectId: string) => ['projects', projectId, 'asset-marks'] as const,
};

/** What is approved for one purpose now, and every decision behind it. */
export function useAssetSelectionSummary(projectId: string, context: AssetSelectionContext) {
  return useQuery({
    queryKey: selectionKeys.context(projectId, context),
    queryFn: () => api.getAssetSelectionSummary(projectId, context),
    enabled: Boolean(projectId) && Boolean(context.entityId) && Boolean(context.purpose),
  });
}

/**
 * Whether this asset is an approved choice for the context right now.
 *
 * Reads the same cached summary the actions and badges do, so a grid asking it
 * per tile costs one request for the whole grid.
 */
export function useIsCurrentSelection(
  projectId: string,
  assetId: string,
  context: AssetSelectionContext,
): boolean {
  const summary = useAssetSelectionSummary(projectId, context);
  return (summary.data?.current ?? []).some((selection) => selection.assetId === assetId);
}

/** Every decision made for one entity, across all of its purposes. */
export function useEntityAssetSelections(projectId: string, entityId: string) {
  return useQuery({
    queryKey: selectionKeys.entity(projectId, entityId),
    queryFn: () => api.listEntityAssetSelections(projectId, entityId),
    enabled: Boolean(projectId) && Boolean(entityId),
  });
}

/** Every decision about one asset — where a rejected concept stays traceable. */
export function useAssetSelectionHistory(projectId: string, assetId: string | null) {
  return useQuery({
    queryKey: selectionKeys.asset(projectId, assetId ?? ''),
    queryFn: () => api.listAssetSelectionsForAsset(projectId, assetId ?? ''),
    enabled: Boolean(projectId) && Boolean(assetId),
  });
}

/** The project's favourites and shortlist, read once for a whole grid. */
export function useAssetMarks(projectId: string) {
  return useQuery({
    queryKey: selectionKeys.marks(projectId),
    queryFn: () => api.listAssetMarks(projectId),
    enabled: Boolean(projectId),
  });
}

export function useApproveAsset(projectId: string) {
  return useSelectionMutation(projectId, (input: api.ApproveAssetSelectionInput) =>
    api.approveAssetSelection(projectId, input),
  );
}

export function useRejectAsset(projectId: string) {
  return useSelectionMutation(projectId, (input: api.DecideAssetSelectionInput) =>
    api.rejectAssetSelection(projectId, input),
  );
}

/**
 * Stars or shortlists an asset, or takes the mark off.
 *
 * One mutation for both directions because the button is one toggle: the caller
 * passes what the mark should become, not which endpoint to call.
 */
export function useToggleAssetMark(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      assetId: string;
      kind: AssetMarkKind;
      marked: boolean;
      actor: string;
    }): Promise<void> => {
      if (input.marked) {
        await api.markAsset(projectId, {
          assetId: input.assetId,
          kind: input.kind,
          actor: input.actor,
        });
        return;
      }

      await api.unmarkAsset(projectId, input.assetId, input.kind);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: selectionKeys.marks(projectId) });
    },
  });
}

/** Every selection write refreshes the whole project's selections: one rule, one place. */
function useSelectionMutation<TInput, TResult>(
  projectId: string,
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: selectionKeys.all(projectId) });
    },
  });
}
