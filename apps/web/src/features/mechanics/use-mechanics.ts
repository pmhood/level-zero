'use client';

import type { CreateEntityInput, Entity, UpdateEntityInput } from '@level-zero/domain';
import type { JSONContent } from '@level-zero/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';

import { LOOP_STEP_RELATION } from './core-loop';
import { MECHANIC_ENTITY_TYPES, MECHANIC_RATIONALE_FIELD } from './mechanic';

export type MechanicLifecycle = 'active' | 'archived';

export interface MechanicFilters {
  lifecycle: MechanicLifecycle;
  search?: string;
}

const mechanicsKeys = {
  all: (projectId: string) => ['projects', projectId, 'mechanics'] as const,
  list: (projectId: string, filters: MechanicFilters) =>
    ['projects', projectId, 'mechanics', 'list', filters] as const,
  entity: (projectId: string, entityId: string) =>
    ['projects', projectId, 'entities', entityId] as const,
  links: (projectId: string, entityId: string) =>
    ['projects', projectId, 'entities', entityId, 'relationships'] as const,
  history: (projectId: string, entityId: string) =>
    ['projects', projectId, 'entities', entityId, 'versions'] as const,
};

/**
 * Mechanics are `Entity` rows of type `mechanic` or `system`.
 *
 * Area and implementation status are type-specific `data` fields, which the
 * listing endpoint cannot filter on, so the workspace narrows those in the
 * browser over the page it already has.
 */
export function useMechanics(projectId: string, filters: MechanicFilters) {
  return useQuery({
    queryKey: mechanicsKeys.list(projectId, filters),
    queryFn: () =>
      api.listEntities(projectId, {
        type: [...MECHANIC_ENTITY_TYPES],
        status: filters.lifecycle === 'archived' ? ['archived'] : undefined,
        search: filters.search,
        limit: 100,
      }),
    enabled: Boolean(projectId),
  });
}

/** The selected mechanic, read by id so an edit elsewhere is reflected here. */
export function useMechanic(projectId: string, entityId: string | null) {
  return useQuery({
    queryKey: mechanicsKeys.entity(projectId, entityId ?? ''),
    queryFn: () => api.getEntity(projectId, entityId as string),
    enabled: Boolean(projectId) && Boolean(entityId),
  });
}

export function useMechanicLinks(projectId: string, entityId: string | null) {
  return useQuery({
    queryKey: mechanicsKeys.links(projectId, entityId ?? ''),
    queryFn: () => api.getEntityNeighborhood(projectId, entityId as string),
    enabled: Boolean(projectId) && Boolean(entityId),
  });
}

export function useMechanicHistory(projectId: string, entityId: string | null) {
  return useQuery({
    queryKey: mechanicsKeys.history(projectId, entityId ?? ''),
    queryFn: () => api.getEntityHistory(projectId, entityId as string),
    enabled: Boolean(projectId) && Boolean(entityId),
  });
}

/** Invalidates the list and one mechanic — every mutation below settles this way. */
function useMechanicInvalidation(projectId: string) {
  const queryClient = useQueryClient();

  return (entityId?: string) => {
    queryClient.invalidateQueries({ queryKey: mechanicsKeys.all(projectId) });
    if (entityId) {
      queryClient.invalidateQueries({ queryKey: mechanicsKeys.entity(projectId, entityId) });
    }
  };
}

export function useCreateMechanic(projectId: string) {
  const invalidate = useMechanicInvalidation(projectId);

  return useMutation({
    mutationFn: (input: Omit<CreateEntityInput, 'projectId'>) => api.createEntity(projectId, input),
    onSuccess: (mechanic) => invalidate(mechanic.id),
  });
}

export function useUpdateMechanic(projectId: string) {
  const invalidate = useMechanicInvalidation(projectId);

  return useMutation({
    mutationFn: ({ entityId, patch }: { entityId: string; patch: UpdateEntityInput }) =>
      api.updateEntity(projectId, entityId, patch),
    onSuccess: (mechanic) => invalidate(mechanic.id),
  });
}

/**
 * Autosaves the rationale attached to one mechanic.
 *
 * `data` is replaced wholesale by the API, so the structured fields are
 * carried over. Nothing in the browser renders the rationale, so unlike the
 * other mutations this does not invalidate anything mid-typing.
 */
export function useSaveMechanicRationale(projectId: string) {
  return useMutation({
    mutationFn: ({ mechanic, rationale }: { mechanic: Entity; rationale: JSONContent }) =>
      api.updateEntity(projectId, mechanic.id, {
        data: { ...mechanic.data, [MECHANIC_RATIONALE_FIELD]: rationale },
      }),
  });
}

export function useArchiveMechanic(projectId: string) {
  const invalidate = useMechanicInvalidation(projectId);

  return useMutation({
    mutationFn: (entityId: string) => api.archiveEntity(projectId, entityId),
    onSuccess: (mechanic) => invalidate(mechanic.id),
  });
}

export function useRestoreMechanic(projectId: string) {
  const invalidate = useMechanicInvalidation(projectId);

  return useMutation({
    mutationFn: (entityId: string) => api.restoreEntity(projectId, entityId),
    onSuccess: (mechanic) => invalidate(mechanic.id),
  });
}

export function useLinkMechanic(projectId: string) {
  const invalidate = useMechanicInvalidation(projectId);

  return useMutation({
    mutationFn: ({ entityId, input }: { entityId: string; input: api.CreateRelationshipInput }) =>
      api.createRelationship(projectId, entityId, input),
    onSuccess: (_relationship, variables) => invalidate(variables.entityId),
  });
}

export function useUnlinkMechanic(projectId: string) {
  const invalidate = useMechanicInvalidation(projectId);

  return useMutation({
    mutationFn: ({ entityId, relationshipId }: { entityId: string; relationshipId: string }) =>
      api.deleteRelationship(projectId, entityId, relationshipId),
    onSuccess: (_result, variables) => invalidate(variables.entityId),
  });
}

/**
 * Adds a mechanic to a loop: a `contains` edge for membership, then the loop's
 * new step order. The edge goes first, so a failed order write leaves the step
 * in the loop (at the end) rather than losing it.
 */
export function useAddLoopStep(projectId: string) {
  const invalidate = useMechanicInvalidation(projectId);

  return useMutation({
    mutationFn: async ({
      loop,
      stepEntityId,
      data,
    }: {
      loop: Entity;
      stepEntityId: string;
      data: Record<string, unknown>;
    }) => {
      await api.createRelationship(projectId, loop.id, {
        targetEntityId: stepEntityId,
        relation: LOOP_STEP_RELATION,
      });
      return api.updateEntity(projectId, loop.id, { data });
    },
    onSuccess: (loop) => invalidate(loop.id),
  });
}

/** Writes a loop's step order. Reordering and removing a step both end here. */
export function useSetLoopOrder(projectId: string) {
  const invalidate = useMechanicInvalidation(projectId);

  return useMutation({
    mutationFn: ({ loop, data }: { loop: Entity; data: Record<string, unknown> }) =>
      api.updateEntity(projectId, loop.id, { data }),
    onSuccess: (loop) => invalidate(loop.id),
  });
}

export function useCommitMechanicVersion(projectId: string) {
  const invalidate = useMechanicInvalidation(projectId);

  return useMutation({
    mutationFn: (entityId: string) =>
      api.commitEntityVersion(projectId, entityId, { reason: 'manual' }),
    onSuccess: (version) => invalidate(version.entityId),
  });
}

export function useRestoreMechanicVersion(projectId: string) {
  const invalidate = useMechanicInvalidation(projectId);

  return useMutation({
    mutationFn: ({ entityId, versionId }: { entityId: string; versionId: string }) =>
      api.restoreEntityVersion(projectId, entityId, versionId),
    onSuccess: (version) => invalidate(version.entityId),
  });
}
