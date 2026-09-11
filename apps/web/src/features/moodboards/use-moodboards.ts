'use client';

import {
  ENTITY_TYPES,
  type Asset,
  type Moodboard,
  type MoodboardNode,
  type MoodboardNodePatch,
  type RelationType,
} from '@level-zero/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { findOrCreateAssetReference } from '@/features/entities/asset-reference';
import * as api from '@/lib/api';

const moodboardKeys = {
  boards: (projectId: string) => ['projects', projectId, 'moodboards'] as const,
  board: (projectId: string, boardId: string) =>
    ['projects', projectId, 'moodboards', boardId] as const,
  library: (projectId: string) => ['projects', projectId, 'moodboards', 'library'] as const,
};

/**
 * Entity types a board's nodes can point at — everything but boards
 * themselves, so a moodboard can never be placed on a moodboard.
 */
const PLACEABLE_ENTITY_TYPES = ENTITY_TYPES.filter((type) => type !== 'moodboard');

/**
 * The project's boards.
 *
 * A moodboard is a `moodboard` entity, so this is the ordinary entity listing
 * rather than an endpoint of its own — and creating one below is the ordinary
 * entity create. Only layout has its own API.
 */
export function useMoodboards(projectId: string) {
  return useQuery({
    queryKey: moodboardKeys.boards(projectId),
    queryFn: () => api.listEntities(projectId, { type: ['moodboard'], limit: 100 }),
    enabled: Boolean(projectId),
  });
}

export function useMoodboard(projectId: string, boardId: string | null) {
  return useQuery({
    queryKey: moodboardKeys.board(projectId, boardId ?? ''),
    queryFn: () => api.getMoodboard(projectId, boardId as string),
    enabled: Boolean(projectId) && Boolean(boardId),
  });
}

/**
 * Every asset and entity a board's nodes might already point at, for the
 * canvas and inspector to resolve a node's reference against.
 *
 * Unfiltered by type and not searched: a node can have been placed before
 * `moodboard` was excluded from {@link useMoodboardLibrarySearch}, or simply
 * point past whatever the rail's search box currently narrows to, and it must
 * still resolve.
 */
export function useMoodboardLibrary(projectId: string) {
  const assets = useQuery({
    queryKey: [...moodboardKeys.library(projectId), 'assets'] as const,
    queryFn: () => api.listAssets(projectId, { kind: ['image'], limit: 100 }),
    enabled: Boolean(projectId),
  });
  const entities = useQuery({
    queryKey: [...moodboardKeys.library(projectId), 'entities'] as const,
    queryFn: () => api.listEntities(projectId, { limit: 200 }),
    enabled: Boolean(projectId),
  });

  return { assets, entities };
}

/**
 * What the rail's "Add to board" picker offers to place next.
 *
 * The query reaches the API rather than filtering a fetched page, so a match
 * outside the first page of assets or entities is still found, and
 * `moodboard` is excluded from the entity types so a board can't be placed on
 * itself.
 */
export function useMoodboardLibrarySearch(projectId: string, search: string) {
  const trimmedSearch = search.trim() || undefined;

  const assets = useQuery({
    queryKey: [...moodboardKeys.library(projectId), 'assets', 'search', trimmedSearch] as const,
    queryFn: () =>
      api.listAssets(projectId, { kind: ['image'], search: trimmedSearch, limit: 100 }),
    enabled: Boolean(projectId),
  });
  const entities = useQuery({
    queryKey: [...moodboardKeys.library(projectId), 'entities', 'search', trimmedSearch] as const,
    queryFn: () =>
      api.listEntities(projectId, {
        type: PLACEABLE_ENTITY_TYPES,
        search: trimmedSearch,
        limit: 200,
      }),
    enabled: Boolean(projectId),
  });

  return { assets, entities };
}

function useBoardInvalidation(projectId: string, boardId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: moodboardKeys.board(projectId, boardId) });
}

export function useCreateMoodboard(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => api.createEntity(projectId, { type: 'moodboard', name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: moodboardKeys.boards(projectId) }),
  });
}

export function useAddMoodboardNode(projectId: string, boardId: string) {
  const invalidate = useBoardInvalidation(projectId, boardId);

  return useMutation({
    mutationFn: (input: api.AddMoodboardNodeInput) =>
      api.addMoodboardNode(projectId, boardId, input),
    onSuccess: invalidate,
  });
}

/**
 * Writes a settled gesture back.
 *
 * The canvas already shows the result, so this does not invalidate the board:
 * refetching mid-drag would replace the nodes the canvas is reconciling against
 * and make the board flicker. Adds, removals and grouping do invalidate,
 * because those change what is on the board rather than where it is.
 */
export function useUpdateMoodboardNodes(projectId: string, boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patches: readonly MoodboardNodePatch[]) =>
      api.updateMoodboardNodes(projectId, boardId, patches),
    onSuccess: (nodes) => {
      queryClient.setQueryData(
        moodboardKeys.board(projectId, boardId),
        (current: Moodboard | undefined) => mergeNodes(current, nodes),
      );
    },
  });
}

export function useRemoveMoodboardNodes(projectId: string, boardId: string) {
  const invalidate = useBoardInvalidation(projectId, boardId);

  return useMutation({
    mutationFn: (nodeIds: readonly string[]) =>
      api.removeMoodboardNodes(projectId, boardId, nodeIds),
    onSuccess: invalidate,
  });
}

/**
 * Re-creates nodes that were removed from the board — undo's inverse of
 * {@link useRemoveMoodboardNodes} (issue #125).
 *
 * Each restored node keeps its layout, group membership, lock state and
 * content, and re-points at the same asset or entity it always did rather
 * than copying either — but under a fresh id, since the row that was deleted
 * is really gone and there is no way to ask the database for it back. One
 * `addMoodboardNode` call per node: the create endpoint takes one node at a
 * time, so a multi-select delete restores as several requests, not one, even
 * though the canvas records it as a single history entry.
 */
export function useRestoreMoodboardNodes(projectId: string, boardId: string) {
  const invalidate = useBoardInvalidation(projectId, boardId);

  return useMutation({
    mutationFn: (nodes: readonly MoodboardNode[]) =>
      Promise.all(
        nodes.map((node) => api.addMoodboardNode(projectId, boardId, restoreInput(node))),
      ),
    onSuccess: invalidate,
  });
}

/** What re-adding a removed node from scratch needs, read back off the row it is restoring. */
function restoreInput(node: MoodboardNode): api.AddMoodboardNodeInput {
  return {
    type: node.type,
    ...(node.assetId ? { assetId: node.assetId } : {}),
    ...(node.entityId ? { entityId: node.entityId } : {}),
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    rotation: node.rotation,
    zOrder: node.zOrder,
    groupId: node.groupId,
    locked: node.locked,
    data: node.data,
  };
}

export function useDuplicateMoodboardNodes(projectId: string, boardId: string) {
  const invalidate = useBoardInvalidation(projectId, boardId);

  return useMutation({
    mutationFn: (nodeIds: readonly string[]) =>
      api.duplicateMoodboardNodes(projectId, boardId, nodeIds),
    onSuccess: invalidate,
  });
}

/** Adds the group row and moves the selection into it in one settled step. */
export function useGroupMoodboardNodes(projectId: string, boardId: string) {
  const invalidate = useBoardInvalidation(projectId, boardId);

  return useMutation({
    mutationFn: async (memberNodeIds: readonly string[]) => {
      const group = await api.addMoodboardNode(projectId, boardId, { type: 'group' });
      await api.updateMoodboardNodes(
        projectId,
        boardId,
        memberNodeIds.map((id) => ({ id, groupId: group.id })),
      );
      return group;
    },
    onSuccess: invalidate,
  });
}

export function useConnectMoodboardNodes(projectId: string, boardId: string) {
  const invalidate = useBoardInvalidation(projectId, boardId);

  return useMutation({
    mutationFn: (input: { fromNodeId: string; toNodeId: string; label?: string }) =>
      api.connectMoodboardNodes(projectId, boardId, input),
    onSuccess: invalidate,
  });
}

export function useDisconnectMoodboardNodes(projectId: string, boardId: string) {
  const invalidate = useBoardInvalidation(projectId, boardId);

  return useMutation({
    mutationFn: (connectorId: string) =>
      api.deleteMoodboardConnector(projectId, boardId, connectorId),
    onSuccess: invalidate,
  });
}

/** The one action that turns a line on the board into a project relationship. */
export function usePromoteMoodboardConnector(projectId: string, boardId: string) {
  const invalidate = useBoardInvalidation(projectId, boardId);

  return useMutation({
    mutationFn: ({ connectorId, relation }: { connectorId: string; relation: RelationType }) =>
      api.promoteMoodboardConnector(projectId, boardId, connectorId, relation),
    onSuccess: invalidate,
  });
}

/**
 * Turns a board's own entity, or an asset already on it, into a visual
 * direction (`design_pillar`), through the ordinary promotion catalogue.
 *
 * An `asset` node has no entity of its own yet — an asset is not an entity —
 * so a raw asset is resolved to its `asset_reference` first, reusing whatever
 * entity already stands for that file, before the same
 * `LineageService.promote` call the board and every `asset_reference` node
 * use. Nothing on the board changes: the reference and the board it came from
 * are left exactly as they were, and the new visual direction lives beside
 * them in the project graph.
 */
export function usePromoteToVisualDirection(projectId: string) {
  return useMutation({
    mutationFn: async (source: { entityId: string } | { asset: Asset }) => {
      const entityId =
        'entityId' in source
          ? source.entityId
          : (await findOrCreateAssetReference(projectId, source.asset)).id;

      return api.promoteEntity(projectId, entityId, { type: 'design_pillar' });
    },
  });
}

/** Folds a save's result into the cached board without a round trip. */
function mergeNodes(
  current: Moodboard | undefined,
  saved: readonly MoodboardNode[],
): Moodboard | undefined {
  if (!current) return current;
  const bySavedId = new Map(saved.map((node) => [node.id, node]));

  return {
    ...current,
    nodes: current.nodes.map((node) => bySavedId.get(node.id) ?? node),
  };
}
