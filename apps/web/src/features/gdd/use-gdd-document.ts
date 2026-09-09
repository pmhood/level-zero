'use client';

import type { Document, DocumentContent } from '@level-zero/domain';
import type { JSONContent } from '@level-zero/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';

/** The name a project's design document is created with, and found again by. */
export const GDD_DOCUMENT_NAME = 'Game Design Document';

const gddKeys = {
  document: (projectId: string) => ['projects', projectId, 'gdd'] as const,
};

/**
 * A project's design document is an `Entity` of type `document`, with its
 * TipTap JSON body in `data`. It is a canonical game object like any other, so
 * it lives in the entity store rather than in a table of its own, and is read
 * through the documents endpoints, which add its version history.
 *
 * The GDD is the document carrying the name it was created with, so a project
 * that later holds a brief or a playtest write-up still opens the same one.
 */
export function useGddDocument(projectId: string) {
  return useQuery({
    queryKey: gddKeys.document(projectId),
    queryFn: async (): Promise<Document | null> => {
      const page = await api.listDocuments(projectId, { search: GDD_DOCUMENT_NAME });
      const match = page.items.find((document) => document.name === GDD_DOCUMENT_NAME);
      return match ? api.getDocument(projectId, match.id) : null;
    },
    enabled: Boolean(projectId),
  });
}

export function useCreateGddDocument(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.createDocument(projectId, { name: GDD_DOCUMENT_NAME }),
    onSuccess: (document) => queryClient.setQueryData(gddKeys.document(projectId), document),
  });
}

/**
 * Autosaves the current body. The API replaces it without writing a version,
 * so a writer pausing for breath never adds an entry to the history.
 *
 * The cache is deliberately left alone: autosave fires while somebody is
 * typing, and pushing the saved document back into the query would re-render
 * the surface they are writing on for no gain.
 */
export function useSaveGddDocument(projectId: string, documentId: string) {
  return useMutation({
    // The editor speaks TipTap's `JSONContent`; the domain describes the same
    // document node without depending on an editor library.
    mutationFn: (content: JSONContent) =>
      api.saveDocumentContent(projectId, documentId, content as DocumentContent),
  });
}
