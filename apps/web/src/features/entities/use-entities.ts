'use client';

import type { EntityType } from '@level-zero/domain';
import { useQuery } from '@tanstack/react-query';

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
