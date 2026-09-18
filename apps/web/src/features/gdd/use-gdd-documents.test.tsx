// @vitest-environment jsdom
import type { Document, Entity, EntityPage } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  useApplyGddStartingStructure,
  useCreateGddDocument,
  useDuplicateGddDocument,
  useGddDocuments,
} from './use-gdd-documents';

vi.mock('@/lib/api', () => ({
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
  createDocument: vi.fn(),
  applyDocumentStartingStructure: vi.fn(),
}));

const api = await import('@/lib/api');

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'doc_1',
    projectId: 'prj_1',
    type: 'document',
    name: 'Untitled',
    description: null,
    status: 'active',
    tags: [],
    data: {},
    currentVersionId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    archivedAt: null,
    ...overrides,
  };
}

function document(overrides: Partial<Document> = {}): Document {
  return {
    entity: entity(),
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    currentVersion: { id: 'ver_1', versionNumber: 3 } as Document['currentVersion'],
    hasUnversionedChanges: false,
    ...overrides,
  };
}

function page(items: Entity[]): EntityPage {
  return { items, total: items.length };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useGddDocuments', () => {
  it('sorts the listed documents by most recently updated, not creation order', async () => {
    vi.mocked(api.listDocuments).mockResolvedValue(
      page([
        entity({ id: 'doc_old', name: 'Old edit', updatedAt: new Date('2026-01-01T00:00:00Z') }),
        entity({
          id: 'doc_newest',
          name: 'Just touched',
          updatedAt: new Date('2026-03-01T00:00:00Z'),
        }),
        entity({
          id: 'doc_middle',
          name: 'Touched last week',
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        }),
      ]),
    );

    const { result } = renderHook(() => useGddDocuments('prj_1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.items.map((item) => item.id)).toEqual([
      'doc_newest',
      'doc_middle',
      'doc_old',
    ]);
  });

  it('excludes archived documents by default', async () => {
    vi.mocked(api.listDocuments).mockResolvedValue(page([]));

    const { result } = renderHook(() => useGddDocuments('prj_1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.listDocuments).toHaveBeenCalledWith('prj_1', { includeArchived: false, limit: 100 });
  });
});

/**
 * A duplicate is a fresh document created from the source's current body
 * (#182) — never a request that could be mistaken for a version restore or a
 * branch. This is the seam where that would actually show up: what
 * `useDuplicateGddDocument` hands `api.createDocument`.
 */
describe('useDuplicateGddDocument', () => {
  it('reads the source document fresh and creates a new one with its body, under a new name', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(
      document({
        entity: entity({ id: 'doc_1', name: 'Driftwake GDD' }),
        content: { type: 'doc', content: [{ type: 'heading', content: [] }] },
      }),
    );
    vi.mocked(api.createDocument).mockResolvedValue(
      document({ entity: entity({ id: 'doc_2', name: 'Driftwake GDD (Copy)' }) }),
    );

    const { result } = renderHook(() => useDuplicateGddDocument('prj_1'), { wrapper });

    const created = await result.current.mutateAsync({
      documentId: 'doc_1',
      name: 'Driftwake GDD (Copy)',
    });

    expect(api.getDocument).toHaveBeenCalledWith('prj_1', 'doc_1');
    expect(api.createDocument).toHaveBeenCalledWith('prj_1', {
      name: 'Driftwake GDD (Copy)',
      content: { type: 'doc', content: [{ type: 'heading', content: [] }] },
    });
    // No version id, parent version or "restore"/"branch" reason travels with
    // it — `createDocument` only ever takes a name and a starting body, so a
    // duplicate cannot be wired to the source's history by construction.
    expect(api.createDocument).toHaveBeenCalledWith(
      'prj_1',
      expect.not.objectContaining({ currentVersionId: expect.anything() }),
    );
    expect(created.entity.id).toBe('doc_2');
  });
});

/**
 * Offered, not imposed (#189): the same create endpoint either way, with the
 * starting structure's body attached only when a writer opted into it.
 */
describe('useCreateGddDocument', () => {
  it('creates a plain document when the structure is not requested', async () => {
    vi.mocked(api.createDocument).mockResolvedValue(document());

    const { result } = renderHook(() => useCreateGddDocument('prj_1'), { wrapper });
    await result.current.mutateAsync({ name: 'Combat Brief' });

    expect(api.createDocument).toHaveBeenCalledWith('prj_1', { name: 'Combat Brief' });
  });

  it('attaches the GDD starting structure as the starting body when chosen', async () => {
    vi.mocked(api.createDocument).mockResolvedValue(document());

    const { result } = renderHook(() => useCreateGddDocument('prj_1'), { wrapper });
    await result.current.mutateAsync({ name: 'Combat Brief', startingStructure: true });

    expect(api.createDocument).toHaveBeenCalledWith('prj_1', {
      name: 'Combat Brief',
      content: expect.objectContaining({ type: 'doc' }),
    });
  });
});

describe('useApplyGddStartingStructure', () => {
  it('seeds the document that has nothing in it yet', async () => {
    vi.mocked(api.applyDocumentStartingStructure).mockResolvedValue(
      document({
        content: {
          type: 'doc',
          content: [{ type: 'heading', content: [{ type: 'text', text: 'High Concept' }] }],
        },
      }),
    );

    const { result } = renderHook(() => useApplyGddStartingStructure('prj_1', 'doc_1'), {
      wrapper,
    });
    const applied = await result.current.mutateAsync();

    expect(api.applyDocumentStartingStructure).toHaveBeenCalledWith('prj_1', 'doc_1');
    expect(applied.content.content).toEqual([
      { type: 'heading', content: [{ type: 'text', text: 'High Concept' }] },
    ]);
  });
});
