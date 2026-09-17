// @vitest-environment jsdom
import type { Document, Entity, EntityPage, Project } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GddWorkspace } from './gdd-workspace';

const push = vi.fn();
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
}));

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
  createDocument: vi.fn(),
  updateEntity: vi.fn(),
  archiveEntity: vi.fn(),
  restoreEntity: vi.fn(),
  saveDocumentContent: vi.fn(),
  snapshotDocument: vi.fn(),
  suggestDocumentEdit: vi.fn(),
  listEntities: vi.fn(),
  getProject: vi.fn(),
}));

const api = await import('@/lib/api');

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'doc_1',
    projectId: 'prj_1',
    type: 'document',
    name: 'Game Design Document',
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
    content: { type: 'doc', content: [] },
    currentVersion: null,
    hasUnversionedChanges: false,
    ...overrides,
  };
}

function page(items: Entity[]): EntityPage {
  return { items, total: items.length };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'prj_1',
    name: 'Driftwake',
    description: 'A salvage the past. Survive what remains.',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    archivedAt: null,
    ...overrides,
  };
}

function renderWorkspace(props: { projectId: string; documentId?: string }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GddWorkspace {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  vi.mocked(api.listEntities).mockResolvedValue(page([]));
  vi.mocked(api.getProject).mockResolvedValue(project());
});

afterEach(cleanup);

describe('GddWorkspace — URL round-trip', () => {
  it('opens the document named by the id in the URL', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(
      document({ entity: entity({ id: 'doc_2', name: 'Combat Brief' }) }),
    );

    renderWorkspace({ projectId: 'prj_1', documentId: 'doc_2' });

    await waitFor(() => expect(api.getDocument).toHaveBeenCalledWith('prj_1', 'doc_2'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Combat Brief/ })).toBeDefined());
  });

  it('with no id, redirects to the most recently updated document', async () => {
    vi.mocked(api.listDocuments).mockResolvedValue(
      page([
        entity({ id: 'doc_old', updatedAt: new Date('2026-01-01T00:00:00Z') }),
        entity({ id: 'doc_new', updatedAt: new Date('2026-02-01T00:00:00Z') }),
      ]),
    );

    renderWorkspace({ projectId: 'prj_1' });

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/projects/prj_1/gdd/doc_new'));
  });

  it('shows a not-found state for an id that names no document', async () => {
    vi.mocked(api.getDocument).mockRejectedValue(new api.ApiRequestError('Entity not found', 404));

    renderWorkspace({ projectId: 'prj_1', documentId: 'doc_missing' });

    await waitFor(() => expect(screen.getByText('Document not found')).toBeDefined());
    expect(screen.getByRole('link', { name: 'Back to documents' }).getAttribute('href')).toBe(
      '/projects/prj_1/gdd',
    );
  });

  it('offers to start a document when a project has none at all', async () => {
    vi.mocked(api.listDocuments).mockResolvedValue(page([]));

    renderWorkspace({ projectId: 'prj_1' });

    await waitFor(() => expect(screen.getByText('No documents yet')).toBeDefined());
    expect(api.listDocuments).toHaveBeenCalledWith('prj_1', { includeArchived: true, limit: 100 });
  });
});

describe('GddWorkspace — project isolation', () => {
  it('reads and writes only the project its own route names', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(document());
    const { unmount } = renderWorkspace({ projectId: 'prj_1', documentId: 'doc_1' });
    await waitFor(() => expect(api.getDocument).toHaveBeenCalledWith('prj_1', 'doc_1'));
    unmount();

    vi.mocked(api.getDocument).mockClear();
    renderWorkspace({ projectId: 'prj_2', documentId: 'doc_1' });
    await waitFor(() => expect(api.getDocument).toHaveBeenCalledWith('prj_2', 'doc_1'));
    // Never asked the first project's project id for the second render.
    expect(api.getDocument).not.toHaveBeenCalledWith('prj_1', 'doc_1');
  });
});

describe('GddWorkspace — archived documents', () => {
  it('opens read-only, with no editing toolbar and no way to start editing', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(
      document({
        entity: entity({ status: 'archived', archivedAt: new Date('2026-02-01T00:00:00Z') }),
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Frozen.' }] }],
        },
      }),
    );

    renderWorkspace({ projectId: 'prj_1', documentId: 'doc_1' });

    await waitFor(() => expect(screen.getByText('Frozen.')).toBeDefined());
    expect(screen.getByText('Archived')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save a version' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Ask AI/ })).toBeNull();
  });
});
