'use client';

import {
  gddStartingStructureContent,
  type DocumentContent,
  type Entity,
  type SnapshotDocumentInput,
} from '@level-zero/domain';
import type { JSONContent } from '@level-zero/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';

/**
 * The name suggested for a project's first design document.
 *
 * Historically the *only* name a GDD could have — the workspace found its one
 * document by matching this exact string (#182). Every project created before
 * the fix still has a document called this; it now opens as an ordinary
 * document like any other, so the name is kept only as the one-click default
 * offered when a project has no documents yet, never as a lookup key.
 */
export const GDD_DOCUMENT_NAME = 'Game Design Document';

const gddKeys = {
  documents: (projectId: string, includeArchived: boolean) =>
    ['projects', projectId, 'gdd', 'documents', { includeArchived }] as const,
  document: (projectId: string, documentId: string) =>
    ['projects', projectId, 'gdd', 'documents', documentId] as const,
  history: (projectId: string, documentId: string) =>
    ['projects', projectId, 'gdd', 'documents', documentId, 'versions'] as const,
  version: (projectId: string, documentId: string, versionId: string) =>
    ['projects', projectId, 'gdd', 'documents', documentId, 'versions', versionId] as const,
};

/** Newest edit first — the switcher's order, and how `/gdd` picks its default. */
function byRecentlyUpdated(items: readonly Entity[]): Entity[] {
  return [...items].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * A project's design documents (#182): every `document` entity, most
 * recently updated first. A document is a canonical entity like any other, so
 * this is the ordinary type-scoped listing rather than an endpoint of its own
 * — the switcher's list, and what `/gdd` reads to pick a default.
 *
 * Archived documents are left out unless asked for, matching how the
 * switcher and the entities list elsewhere in the app treat archiving as a
 * state to opt into seeing rather than a permanent removal.
 */
export function useGddDocuments(
  projectId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {},
) {
  return useQuery({
    queryKey: gddKeys.documents(projectId, includeArchived),
    queryFn: async () => {
      const page = await api.listDocuments(projectId, { includeArchived, limit: 100 });
      return { ...page, items: byRecentlyUpdated(page.items) };
    },
    enabled: Boolean(projectId),
  });
}

/** One document, with its body and version state, by id — the URL a document opens at. */
export function useGddDocument(projectId: string, documentId: string | null) {
  return useQuery({
    queryKey: gddKeys.document(projectId, documentId ?? ''),
    queryFn: () => api.getDocument(projectId, documentId as string),
    enabled: Boolean(projectId) && Boolean(documentId),
  });
}

/**
 * Every document mutation changes what the switcher's list and/or the open
 * document look like, and none of them happen often enough to hand-pick a
 * narrower invalidation — refetching both is cheap and always correct.
 */
function useGddDocumentsInvalidation(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'gdd', 'documents'] });
}

/**
 * Creates a document, offered rather than imposed (#189): a writer opts into
 * the GDD starting structure per document, and the default stays what it has
 * always been — an empty document — when they don't.
 */
export function useCreateGddDocument(projectId: string) {
  const invalidate = useGddDocumentsInvalidation(projectId);

  return useMutation({
    mutationFn: ({
      name,
      startingStructure = false,
    }: {
      name: string;
      startingStructure?: boolean;
    }) =>
      api.createDocument(projectId, {
        name,
        ...(startingStructure ? { content: gddStartingStructureContent() } : {}),
      }),
    onSuccess: invalidate,
  });
}

/**
 * Seeds the GDD starting structure into a document that has nothing in it yet
 * (#189) — the "projects that already have one" case, for a document created
 * (or left) empty before this landed, or one someone chose to start blank.
 */
export function useApplyGddStartingStructure(projectId: string, documentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.applyDocumentStartingStructure(projectId, documentId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: gddKeys.document(projectId, documentId) }),
  });
}

/**
 * Duplicates a document: a new document carrying the source's current body
 * and none of its history (#182) — created through the ordinary create
 * endpoint with that body as a starting point, never a branch of the
 * original's version chain. Reads the source fresh rather than trusting
 * whatever the editor last rendered, so a duplicate never misses a save the
 * caller made just before asking for one.
 */
export function useDuplicateGddDocument(projectId: string) {
  const invalidate = useGddDocumentsInvalidation(projectId);

  return useMutation({
    mutationFn: async ({ documentId, name }: { documentId: string; name: string }) => {
      const source = await api.getDocument(projectId, documentId);
      return api.createDocument(projectId, { name, content: source.content });
    },
    onSuccess: invalidate,
  });
}

/** Renames a document — `Entity.name` is the title; there is no separate title field. */
export function useRenameGddDocument(projectId: string) {
  const invalidate = useGddDocumentsInvalidation(projectId);

  return useMutation({
    mutationFn: ({ documentId, name }: { documentId: string; name: string }) =>
      api.updateEntity(projectId, documentId, { name }),
    onSuccess: invalidate,
  });
}

export function useArchiveGddDocument(projectId: string) {
  const invalidate = useGddDocumentsInvalidation(projectId);

  return useMutation({
    mutationFn: (documentId: string) => api.archiveEntity(projectId, documentId),
    onSuccess: invalidate,
  });
}

export function useRestoreGddDocument(projectId: string) {
  const invalidate = useGddDocumentsInvalidation(projectId);

  return useMutation({
    mutationFn: (documentId: string) => api.restoreEntity(projectId, documentId),
    onSuccess: invalidate,
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

/**
 * Records a version of the document as the server currently holds it.
 *
 * Autosave writes the working copy and nothing else, so a caller taking a
 * snapshot has to have saved the body it means to keep first — the version is
 * of what is stored, not of what is on screen.
 */
export function useSnapshotGddDocument(projectId: string, documentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SnapshotDocumentInput) =>
      api.snapshotDocument(projectId, documentId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: gddKeys.history(projectId, documentId) }),
  });
}

/** The history panel's list: every version, newest first, without a body per entry. */
export function useGddDocumentHistory(projectId: string, documentId: string) {
  return useQuery({
    queryKey: gddKeys.history(projectId, documentId),
    queryFn: () => api.listDocumentVersions(projectId, documentId),
    enabled: Boolean(projectId) && Boolean(documentId),
  });
}

/** One version with the body it holds, to read it or preview before restoring it. */
export function useGddDocumentVersion(
  projectId: string,
  documentId: string,
  versionId: string | null,
) {
  return useQuery({
    queryKey: gddKeys.version(projectId, documentId, versionId ?? ''),
    queryFn: () => api.getDocumentVersion(projectId, documentId, versionId as string),
    enabled: Boolean(projectId) && Boolean(documentId) && Boolean(versionId),
  });
}

/**
 * Restoring appends a new version rather than rewinding, so the history list
 * and the document itself (its content and `currentVersionId`) both move on.
 *
 * One invalidation, not two: `gddKeys.document(...)` is a prefix of
 * `gddKeys.history(...)` and `gddKeys.version(...)`, and `invalidateQueries`
 * matches by prefix, so it already covers the history list and any version
 * read alongside the document itself. Invalidating both separately queued
 * the history query twice and raced its own two mock responses in tests.
 */
export function useRestoreGddDocumentVersion(projectId: string, documentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionId: string) => api.restoreDocumentVersion(projectId, documentId, versionId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: gddKeys.document(projectId, documentId) }),
  });
}
