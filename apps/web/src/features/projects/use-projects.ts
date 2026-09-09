'use client';

import type { CreateProjectInput, UpdateProjectInput } from '@level-zero/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';

export const projectsKeys = {
  all: ['projects'] as const,
  list: (params: api.ListProjectsParams) => ['projects', 'list', params] as const,
  detail: (projectId: string) => ['projects', 'detail', projectId] as const,
};

export function useProjects(params: api.ListProjectsParams = {}) {
  return useQuery({
    queryKey: projectsKeys.list(params),
    queryFn: () => api.listProjects(params),
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: projectsKeys.detail(projectId),
    queryFn: () => api.getProject(projectId),
    enabled: Boolean(projectId),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProjectInput) => api.createProject(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsKeys.all }),
  });
}

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: UpdateProjectInput) => api.updateProject(projectId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsKeys.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: projectsKeys.all });
    },
  });
}
