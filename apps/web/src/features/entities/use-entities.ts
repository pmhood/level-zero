'use client';

import type { EntityType } from '@level-zero/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';

import { REFERENCEABLE_ENTITY_TYPES } from './entity-reference';

/** Entities of one canonical type in a project — used by tools that only care about one slice of the graph. */
export function useEntitiesByType(projectId: string, type: EntityType) {
  return useQuery({
    queryKey: ['projects', projectId, 'entities', 'type', type],
    queryFn: () => api.listEntities(projectId, { type: [type], limit: 50 }),
    enabled: Boolean(projectId),
  });
}

/**
 * A single entity, by id, whatever its type — the canonical entity page's
 * load (docs/decisions/canonical-entity-routes.md §2.2) and anything else
 * that has an id and needs the entity it names rather than a slice of a list.
 */
export function useEntity(projectId: string, entityId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'entities', entityId],
    queryFn: () => api.getEntity(projectId, entityId),
    enabled: Boolean(projectId) && Boolean(entityId),
  });
}

/** Everything one hop from an entity — the canonical entity page's Relationships, for every type. */
export function useEntityNeighborhood(projectId: string, entityId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'entities', entityId, 'relationships'],
    queryFn: () => api.getEntityNeighborhood(projectId, entityId),
    enabled: Boolean(projectId) && Boolean(entityId),
  });
}

/**
 * Restoring an archived entity from the canonical page (§8). Every workspace
 * already has its own restore with narrower invalidation; this one does not
 * know which workspace, if any, owns the type, so — like version restore and
 * branch in `use-entity-versions.ts` — it invalidates the whole project
 * rather than guessing at which lists are stale.
 */
export function useRestoreEntity(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entityId: string) => api.restoreEntity(projectId, entityId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId] }),
  });
}

/**
 * The entities a document can reference, as the one list every mention and
 * embed resolves against.
 *
 * Archived entities are included: a reference written before something was
 * archived still points at it, and archived is a state to show rather than a
 * reason to render the reference as broken.
 */
export function useReferenceableEntities(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'entities', 'referenceable'],
    queryFn: () =>
      api.listEntities(projectId, {
        type: [...REFERENCEABLE_ENTITY_TYPES],
        includeArchived: true,
        limit: 200,
      }),
    enabled: Boolean(projectId),
  });
}
