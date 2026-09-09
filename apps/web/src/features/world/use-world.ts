'use client';

import type { CreateEntityInput, Entity, UpdateEntityInput } from '@level-zero/domain';
import type { JSONContent } from '@level-zero/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';

import { WORLD_ENTITY_TYPES, WORLD_LORE_FIELD } from './world';

export type WorldLifecycle = 'active' | 'archived';

export interface WorldFilters {
  lifecycle: WorldLifecycle;
  search?: string;
}

const worldKeys = {
  all: (projectId: string) => ['projects', projectId, 'world'] as const,
  list: (projectId: string, filters: WorldFilters) =>
    ['projects', projectId, 'world', 'list', filters] as const,
  entity: (projectId: string, entityId: string) =>
    ['projects', projectId, 'entities', entityId] as const,
  links: (projectId: string, entityId: string) =>
    ['projects', projectId, 'entities', entityId, 'relationships'] as const,
  history: (projectId: string, entityId: string) =>
    ['projects', projectId, 'entities', entityId, 'versions'] as const,
};

/**
 * Every canonical entity the setting is made of, in one page.
 *
 * The dashboard groups this list by type and the browser filters it, so both
 * halves of the workspace read the same rows and neither can drift from the
 * other. Type, canon status and tag are narrowed client-side: the listing
 * endpoint filters on the entity's own columns and cannot reach into `data`.
 */
export function useWorldEntities(projectId: string, filters: WorldFilters) {
  return useQuery({
    queryKey: worldKeys.list(projectId, filters),
    queryFn: () =>
      api.listEntities(projectId, {
        type: [...WORLD_ENTITY_TYPES],
        status: filters.lifecycle === 'archived' ? ['archived'] : undefined,
        search: filters.search,
        limit: 200,
      }),
    enabled: Boolean(projectId),
  });
}

/** The selected entity, read by id so an edit elsewhere is reflected here. */
export function useWorldEntity(projectId: string, entityId: string | null) {
  return useQuery({
    queryKey: worldKeys.entity(projectId, entityId ?? ''),
    queryFn: () => api.getEntity(projectId, entityId as string),
    enabled: Boolean(projectId) && Boolean(entityId),
  });
}

export function useWorldLinks(projectId: string, entityId: string | null) {
  return useQuery({
    queryKey: worldKeys.links(projectId, entityId ?? ''),
    queryFn: () => api.getEntityNeighborhood(projectId, entityId as string),
    enabled: Boolean(projectId) && Boolean(entityId),
  });
}

export function useWorldHistory(projectId: string, entityId: string | null) {
  return useQuery({
    queryKey: worldKeys.history(projectId, entityId ?? ''),
    queryFn: () => api.getEntityHistory(projectId, entityId as string),
    enabled: Boolean(projectId) && Boolean(entityId),
  });
}

/** Invalidates the world listing and one entity — every mutation settles this way. */
function useWorldInvalidation(projectId: string) {
  const queryClient = useQueryClient();

  return (entityId?: string) => {
    queryClient.invalidateQueries({ queryKey: worldKeys.all(projectId) });
    if (entityId) {
      queryClient.invalidateQueries({ queryKey: worldKeys.entity(projectId, entityId) });
    }
  };
}

export function useCreateWorldEntity(projectId: string) {
  const invalidate = useWorldInvalidation(projectId);

  return useMutation({
    mutationFn: (input: Omit<CreateEntityInput, 'projectId'>) => api.createEntity(projectId, input),
    onSuccess: (entity) => invalidate(entity.id),
  });
}

export function useUpdateWorldEntity(projectId: string) {
  const invalidate = useWorldInvalidation(projectId);

  return useMutation({
    mutationFn: ({ entityId, patch }: { entityId: string; patch: UpdateEntityInput }) =>
      api.updateEntity(projectId, entityId, patch),
    onSuccess: (entity) => invalidate(entity.id),
  });
}

/**
 * Autosaves the lore attached to one world entity.
 *
 * `data` is replaced wholesale by the API, so the structured fields are
 * carried over. Nothing in the browser renders lore, so unlike the other
 * mutations this does not invalidate anything mid-typing.
 */
export function useSaveWorldLore(projectId: string) {
  return useMutation({
    mutationFn: ({ entity, lore }: { entity: Entity; lore: JSONContent }) =>
      api.updateEntity(projectId, entity.id, {
        data: { ...entity.data, [WORLD_LORE_FIELD]: lore },
      }),
  });
}

export function useArchiveWorldEntity(projectId: string) {
  const invalidate = useWorldInvalidation(projectId);

  return useMutation({
    mutationFn: (entityId: string) => api.archiveEntity(projectId, entityId),
    onSuccess: (entity) => invalidate(entity.id),
  });
}

export function useRestoreWorldEntity(projectId: string) {
  const invalidate = useWorldInvalidation(projectId);

  return useMutation({
    mutationFn: (entityId: string) => api.restoreEntity(projectId, entityId),
    onSuccess: (entity) => invalidate(entity.id),
  });
}

export function useLinkWorldEntity(projectId: string) {
  const invalidate = useWorldInvalidation(projectId);

  return useMutation({
    mutationFn: ({ entityId, input }: { entityId: string; input: api.CreateRelationshipInput }) =>
      api.createRelationship(projectId, entityId, input),
    onSuccess: (_relationship, variables) => invalidate(variables.entityId),
  });
}

export function useUnlinkWorldEntity(projectId: string) {
  const invalidate = useWorldInvalidation(projectId);

  return useMutation({
    mutationFn: ({ entityId, relationshipId }: { entityId: string; relationshipId: string }) =>
      api.deleteRelationship(projectId, entityId, relationshipId),
    onSuccess: (_result, variables) => invalidate(variables.entityId),
  });
}

export function useCommitWorldVersion(projectId: string) {
  const invalidate = useWorldInvalidation(projectId);

  return useMutation({
    mutationFn: (entityId: string) =>
      api.commitEntityVersion(projectId, entityId, { reason: 'manual' }),
    onSuccess: (version) => invalidate(version.entityId),
  });
}

export function useRestoreWorldVersion(projectId: string) {
  const invalidate = useWorldInvalidation(projectId);

  return useMutation({
    mutationFn: ({ entityId, versionId }: { entityId: string; versionId: string }) =>
      api.restoreEntityVersion(projectId, entityId, versionId),
    onSuccess: (version) => invalidate(version.entityId),
  });
}
