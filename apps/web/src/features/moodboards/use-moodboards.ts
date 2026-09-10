'use client';

import type {
  Moodboard,
  MoodboardNode,
  MoodboardNodePatch,
  RelationType,
} from '@level-zero/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';

const moodboardKeys = {
  boards: (projectId: string) => ['projects', projectId, 'moodboards'] as const,
  board: (projectId: string, boardId: string) =>
    ['projects', projectId, 'moodboards', boardId] as const,
  library: (projectId: string) => ['projects', projectId, 'moodboards', 'library'] as const,
};

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

/** The assets and entities a board can point at, for the inspector's picker. */
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
