'use client';

import type { Entity } from '@level-zero/domain';
import type { JSONContent } from '@level-zero/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';

/** The name a project's design document is created with. */
export const GDD_DOCUMENT_NAME = 'Game Design Document';

/** Field of the entity's `data` the TipTap JSON lives in. */
export const GDD_CONTENT_FIELD = 'content';

const gddKeys = {
  document: (projectId: string) => ['projects', projectId, 'gdd'] as const,
};

/**
 * A project's design document is an `Entity` of type `document`, with its
 * TipTap JSON in `data`. It is a canonical game object like any other, so it
 * lives in the entity store rather than in a table of its own.
 */
export function useGddDocument(projectId: string) {
  return useQuery({
    queryKey: gddKeys.document(projectId),
    queryFn: async (): Promise<Entity | null> => {
      // TODO(#14): the project's first `document` entity is the GDD only while
      // it is the only one. Document persistence gives these a real identity.
      const page = await api.listEntities(projectId, { type: ['document'], limit: 1 });
      return page.items[0] ?? null;
    },
    enabled: Boolean(projectId),
  });
}

export function useCreateGddDocument(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.createEntity(projectId, { type: 'document', name: GDD_DOCUMENT_NAME, status: 'draft' }),
    onSuccess: (document) => queryClient.setQueryData(gddKeys.document(projectId), document),
  });
}

/**
 * Writes the current content back.
 *
 * `data` is replaced wholesale by the API, so the rest of it is carried over.
 * The cache is deliberately left alone: autosave fires while somebody is
 * typing, and pushing the saved document back into the query would re-render
 * the surface they are writing on for no gain.
 */
export function useSaveGddDocument(projectId: string) {
  return useMutation({
    mutationFn: ({ designDocument, content }: { designDocument: Entity; content: JSONContent }) =>
      api.updateEntity(projectId, designDocument.id, {
        data: { ...designDocument.data, [GDD_CONTENT_FIELD]: content },
      }),
  });
}
