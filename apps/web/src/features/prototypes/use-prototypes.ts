'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';

const prototypeKeys = {
  /** Everything about one prototype's version history — the invalidation root. */
  all: (projectId: string, prototypeId: string) =>
    ['projects', projectId, 'prototypes', prototypeId] as const,
  versions: (projectId: string, prototypeId: string) =>
    ['projects', projectId, 'prototypes', prototypeId, 'versions'] as const,
  contents: (projectId: string, prototypeId: string, versionId: string) =>
    ['projects', projectId, 'prototypes', prototypeId, 'versions', versionId, 'contents'] as const,
  compare: (projectId: string, prototypeId: string, fromId: string, toId: string) =>
    [
      'projects',
      projectId,
      'prototypes',
      prototypeId,
      'versions',
      'compare',
      fromId,
      toId,
    ] as const,
};

export type PrototypeLifecycle = 'active' | 'archived';

export interface PrototypeFilters {
  lifecycle: PrototypeLifecycle;
  search?: string;
}

const prototypeEntityKeys = {
  list: (projectId: string, filters: PrototypeFilters) =>
    ['projects', projectId, 'prototypes', 'entities', 'list', filters] as const,
};

/**
 * `prototype` entities in the project — the browser's list.
 *
 * Prototypes are created through the promotion flow (mechanic, system or
 * scene → prototype), never composed here, so — unlike Characters and
 * Mechanics — this workspace has no "create" mutation of its own.
 */
export function usePrototypeEntities(projectId: string, filters: PrototypeFilters) {
  return useQuery({
    queryKey: prototypeEntityKeys.list(projectId, filters),
    queryFn: () =>
      api.listEntities(projectId, {
        type: ['prototype'],
        status: filters.lifecycle === 'archived' ? ['archived'] : undefined,
        search: filters.search,
        limit: 100,
      }),
    enabled: Boolean(projectId),
  });
}

/** Invalidates the browser's lists and one prototype entity — every mutation below settles this way. */
function usePrototypeEntityInvalidation(projectId: string) {
  const queryClient = useQueryClient();

  return (entityId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'prototypes', 'entities'] });
    if (entityId) {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'entities', entityId] });
    }
  };
}

export function useArchivePrototype(projectId: string) {
  const invalidate = usePrototypeEntityInvalidation(projectId);

  return useMutation({
    mutationFn: (entityId: string) => api.archiveEntity(projectId, entityId),
    onSuccess: (prototype) => invalidate(prototype.id),
  });
}

export function useRestorePrototype(projectId: string) {
  const invalidate = usePrototypeEntityInvalidation(projectId);

  return useMutation({
    mutationFn: (entityId: string) => api.restoreEntity(projectId, entityId),
    onSuccess: (prototype) => invalidate(prototype.id),
  });
}

/** A prototype's captured versions, newest first (`listForPrototype` orders by `versionNumber desc`). */
export function usePrototypeVersions(projectId: string, prototypeId: string | null) {
  return useQuery({
    queryKey: prototypeKeys.versions(projectId, prototypeId ?? ''),
    queryFn: () => api.listPrototypeVersions(projectId, prototypeId as string, { limit: 100 }),
    enabled: Boolean(projectId) && Boolean(prototypeId),
  });
}

/** One version's exact pinned entity versions and build artifact, resolved. */
export function usePrototypeVersionContents(
  projectId: string,
  prototypeId: string | null,
  versionId: string | null,
) {
  return useQuery({
    queryKey: prototypeKeys.contents(projectId, prototypeId ?? '', versionId ?? ''),
    queryFn: () =>
      api.getPrototypeVersionContents(projectId, prototypeId as string, versionId as string),
    enabled: Boolean(projectId) && Boolean(prototypeId) && Boolean(versionId),
  });
}

/** Which entity versions moved between two versions of the same prototype. */
export function usePrototypeVersionCompare(
  projectId: string,
  prototypeId: string | null,
  fromId: string | null,
  toId: string | null,
) {
  return useQuery({
    queryKey: prototypeKeys.compare(projectId, prototypeId ?? '', fromId ?? '', toId ?? ''),
    queryFn: () =>
      api.comparePrototypeVersions(
        projectId,
        prototypeId as string,
        fromId as string,
        toId as string,
      ),
    enabled:
      Boolean(projectId) &&
      Boolean(prototypeId) &&
      Boolean(fromId) &&
      Boolean(toId) &&
      fromId !== toId,
  });
}

/** Updates a version's status or notes. The pinned members are never rewritten. */
export function useAnnotatePrototypeVersion(projectId: string, prototypeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      versionId,
      patch,
    }: {
      versionId: string;
      patch: api.AnnotatePrototypeVersionParams;
    }) => api.annotatePrototypeVersion(projectId, prototypeId, versionId, patch),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: prototypeKeys.all(projectId, prototypeId) }),
  });
}
