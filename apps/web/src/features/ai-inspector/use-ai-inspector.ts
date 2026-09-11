'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';

/**
 * What this deployment can actually run.
 *
 * Read once per project and cached: the answer depends on which providers are
 * registered, not on anything the user does, so it is what lets the panel
 * offer an unserved action as unavailable instead of as a button that fails.
 */
export function useAiCapabilities(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'ai', 'capabilities'],
    queryFn: () => api.listAiCapabilities(projectId),
    enabled: Boolean(projectId),
    staleTime: Infinity,
  });
}

/** Runs one contextual action. The answer is held in the panel, never in the project. */
export function useRunAiAction(projectId: string) {
  return useMutation({
    mutationFn: (input: api.RunAiActionInput) => api.runAiAction(projectId, input),
  });
}

/**
 * Accepts one recommendation as a draft idea.
 *
 * Invalidates the whole project rather than a list: the inspector is mounted
 * in every workspace and does not know which of them is showing ideas, the
 * same reasoning as `useRestoreEntity`.
 */
export function useAcceptAiActionResult(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ generationId, ...input }: api.AcceptAiActionInput & { generationId: string }) =>
      api.acceptAiActionResult(projectId, generationId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId] }),
  });
}
