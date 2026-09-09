'use client';

import type { EntityType } from '@level-zero/domain';
import { useQuery } from '@tanstack/react-query';

import * as api from '@/lib/api';

/** Entities of one canonical type in a project — used by tools that only care about one slice of the graph. */
export function useEntitiesByType(projectId: string, type: EntityType) {
  return useQuery({
    queryKey: ['projects', projectId, 'entities', 'type', type],
    queryFn: () => api.listEntities(projectId, { type: [type], limit: 50 }),
    enabled: Boolean(projectId),
  });
}
