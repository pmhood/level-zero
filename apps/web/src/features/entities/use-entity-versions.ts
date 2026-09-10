'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';

/**
 * An entity's history, and the two things a comparison can do with it.
 *
 * Every workspace keeps its own hooks for the entities it owns, but a version
 * is a version whatever the entity is, and compare is offered from all of
 * them — so this is one set rather than the same three mutations copied per
 * tool. Both mutations *append*: nothing here can shorten a history.
 */
const versionKeys = {
  history: (projectId: string, entityId: string) =>
    ['projects', projectId, 'entities', entityId, 'versions'] as const,
};

export function useEntityHistory(projectId: string, entityId: string) {
  return useQuery({
    queryKey: versionKeys.history(projectId, entityId),
    queryFn: () => api.getEntityHistory(projectId, entityId),
    enabled: Boolean(projectId) && Boolean(entityId),
  });
}

/**
 * Restoring and branching rewrite the entity itself, not only its history, so
 * everything the project has cached about it is stale — including the browsers
 * and dashboards of whichever workspace is showing it. The whole project is
 * invalidated rather than guessing at which keys those are; both actions are
 * deliberate and rare.
 */
function useProjectInvalidation(projectId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
}

export function useRestoreEntityVersion(projectId: string) {
  const invalidate = useProjectInvalidation(projectId);

  return useMutation({
    mutationFn: ({ entityId, versionId }: { entityId: string; versionId: string }) =>
      api.restoreEntityVersion(projectId, entityId, versionId),
    onSuccess: invalidate,
  });
}

export function useBranchEntityVersion(projectId: string) {
  const invalidate = useProjectInvalidation(projectId);

  return useMutation({
    mutationFn: ({
      entityId,
      versionId,
      branchName,
    }: {
      entityId: string;
      versionId: string;
      branchName: string;
    }) => api.branchEntityVersion(projectId, entityId, versionId, { branchName }),
    onSuccess: invalidate,
  });
}
