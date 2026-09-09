'use client';

import type { CreateEntityInput, PromoteEntityInput, UpdateEntityInput } from '@level-zero/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';

export type IdeaTab = 'ideas' | 'archived';

export interface IdeaFilters {
  tab: IdeaTab;
  search?: string;
  tag?: string;
}

const ideasKeys = {
  all: (projectId: string) => ['projects', projectId, 'ideas'] as const,
  list: (projectId: string, filters: IdeaFilters) =>
    ['projects', projectId, 'ideas', 'list', filters] as const,
  neighborhood: (projectId: string, entityId: string) =>
    ['projects', projectId, 'entities', entityId, 'relationships'] as const,
};

/** Ideas are `Entity` rows with `type: 'idea'`, scoped to the active project. */
export function useIdeas(projectId: string, filters: IdeaFilters) {
  return useQuery({
    queryKey: ideasKeys.list(projectId, filters),
    queryFn: () =>
      api.listEntities(projectId, {
        type: ['idea'],
        status: filters.tab === 'archived' ? ['archived'] : undefined,
        search: filters.search,
        tag: filters.tag ? [filters.tag] : undefined,
        limit: 100,
      }),
    enabled: Boolean(projectId),
  });
}

export function useCreateIdea(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<CreateEntityInput, 'projectId' | 'type'>) =>
      api.createEntity(projectId, { ...input, type: 'idea' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ideasKeys.all(projectId) }),
  });
}

export function useUpdateIdea(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entityId, patch }: { entityId: string; patch: UpdateEntityInput }) =>
      api.updateEntity(projectId, entityId, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ideasKeys.all(projectId) }),
  });
}

export function useArchiveIdea(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entityId: string) => api.archiveEntity(projectId, entityId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ideasKeys.all(projectId) }),
  });
}

export function useRestoreIdea(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entityId: string) => api.restoreEntity(projectId, entityId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ideasKeys.all(projectId) }),
  });
}

/** The relationship edges touching one idea — used for the Links tab. */
export function useEntityNeighborhood(projectId: string, entityId: string | null) {
  return useQuery({
    queryKey: entityId ? ideasKeys.neighborhood(projectId, entityId) : ideasKeys.all(projectId),
    queryFn: () => api.getEntityNeighborhood(projectId, entityId as string),
    enabled: Boolean(projectId) && Boolean(entityId),
  });
}

export function usePromoteIdea(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entityId, input }: { entityId: string; input: PromoteEntityInput }) =>
      api.promoteEntity(projectId, entityId, input),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ideasKeys.all(projectId) });
      queryClient.invalidateQueries({
        queryKey: ideasKeys.neighborhood(projectId, variables.entityId),
      });
    },
  });
}
