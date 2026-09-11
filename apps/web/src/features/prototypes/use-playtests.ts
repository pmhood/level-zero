'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';

const playtestKeys = {
  forVersion: (projectId: string, prototypeVersionId: string) =>
    ['projects', projectId, 'playtests', 'version', prototypeVersionId] as const,
};

/** Playtests recorded against one exact prototype version — never the whole prototype. */
export function usePlaytestsForVersion(projectId: string, prototypeVersionId: string | null) {
  return useQuery({
    queryKey: playtestKeys.forVersion(projectId, prototypeVersionId ?? ''),
    queryFn: () =>
      api.listPlaytests(projectId, {
        prototypeVersionId: prototypeVersionId as string,
        limit: 100,
      }),
    enabled: Boolean(projectId) && Boolean(prototypeVersionId),
  });
}

export function useCreatePlaytest(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: api.CreatePlaytestParams) => api.createPlaytest(projectId, input),
    onSuccess: (playtest) =>
      queryClient.invalidateQueries({
        queryKey: playtestKeys.forVersion(projectId, playtest.prototypeVersionId),
      }),
  });
}
