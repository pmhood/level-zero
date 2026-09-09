'use client';

import { useQuery } from '@tanstack/react-query';

import * as api from '@/lib/api';

const searchKeys = {
  results: (projectId: string, params: api.SearchParams) =>
    ['projects', projectId, 'search', params] as const,
};

/**
 * Runs a project search. An empty question in `semantic` mode is not a query
 * the API accepts, so the hook stays idle until there is something to ask.
 */
export function useProjectSearch(projectId: string, params: api.SearchParams) {
  const hasQuestion = Boolean(params.q?.trim());

  return useQuery({
    queryKey: searchKeys.results(projectId, params),
    queryFn: () => api.searchProject(projectId, params),
    enabled: Boolean(projectId) && (params.mode !== 'semantic' || hasQuestion),
  });
}
