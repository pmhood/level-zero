// @vitest-environment jsdom
import type { Document, Entity, EntityPage } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentSwitcher } from './document-switcher';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
  createDocument: vi.fn(),
  updateEntity: vi.fn(),
  archiveEntity: vi.fn(),
  restoreEntity: vi.fn(),
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

function documentOf(entityRecord: Entity): Document {
  return {
    entity: entityRecord,
    content: { type: 'doc', content: [] },
    currentVersion: null,
    hasUnversionedChanges: false,
  };
}

function page(items: Entity[]): EntityPage {
  return { items, total: items.length };
}

function renderSwitcher(current: Entity) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DocumentSwitcher projectId="prj_1" current={current} />
    </QueryClientProvider>,
  );
}

async function openSwitcher() {
  fireEvent.click(screen.getByRole('button', { name: /Game Design Document/ }));
  await waitFor(() => expect(screen.getByRole('menu')).toBeDefined());
}

beforeEach(() => {
  push.mockClear();
  vi.mocked(api.listDocuments).mockResolvedValue(page([entity()]));
});

afterEach(cleanup);

describe('DocumentSwitcher', () => {
  it('lists the project documents and opens the one clicked', async () => {
    vi.mocked(api.listDocuments).mockResolvedValue(
      page([entity(), entity({ id: 'doc_2', name: 'Combat Brief' })]),
    );
    renderSwitcher(entity());

    await openSwitcher();
    const menu = screen.getByRole('menu');
    await waitFor(() => expect(within(menu).getByText('Combat Brief')).toBeDefined());

    fireEvent.click(within(menu).getByText('Combat Brief'));

    expect(push).toHaveBeenCalledWith('/projects/prj_1/gdd/doc_2');
  });

  it('asks for archived documents only once "Show archived" is checked', async () => {
    renderSwitcher(entity());
    await openSwitcher();

    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenCalledWith('prj_1', {
        includeArchived: false,
        limit: 100,
      }),
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show archived' }));

    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenCalledWith('prj_1', {
        includeArchived: true,
        limit: 100,
      }),
    );
  });

  it('creates a document and opens it', async () => {
    vi.mocked(api.createDocument).mockResolvedValue(
      documentOf(entity({ id: 'doc_new', name: 'Combat Brief' })),
    );
    renderSwitcher(entity());
    await openSwitcher();

    fireEvent.change(screen.getByLabelText('New document name'), {
      target: { value: 'Combat Brief' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(api.createDocument).toHaveBeenCalledWith('prj_1', { name: 'Combat Brief' }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/projects/prj_1/gdd/doc_new'));
  });

  it('creates a document from the GDD starting structure when offered and chosen', async () => {
    vi.mocked(api.createDocument).mockResolvedValue(
      documentOf(entity({ id: 'doc_new', name: 'Combat Brief' })),
    );
    renderSwitcher(entity());
    await openSwitcher();

    fireEvent.change(screen.getByLabelText('New document name'), {
      target: { value: 'Combat Brief' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Start from the GDD structure' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(api.createDocument).toHaveBeenCalledWith(
        'prj_1',
        expect.objectContaining({
          name: 'Combat Brief',
          content: expect.objectContaining({ type: 'doc' }),
        }),
      ),
    );
  });

  it('duplicates the current document with a fresh id and no history', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(
      documentOf(entity({ data: { content: { type: 'doc', content: [] } } })),
    );
    vi.mocked(api.createDocument).mockResolvedValue(
      documentOf(entity({ id: 'doc_copy', name: 'Game Design Document (Copy)' })),
    );
    renderSwitcher(entity());
    await openSwitcher();

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));

    await waitFor(() => expect(api.getDocument).toHaveBeenCalledWith('prj_1', 'doc_1'));
    await waitFor(() =>
      expect(api.createDocument).toHaveBeenCalledWith('prj_1', {
        name: 'Game Design Document (Copy)',
        content: { type: 'doc', content: [] },
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/projects/prj_1/gdd/doc_copy'));
  });

  it('renames the current document', async () => {
    vi.mocked(api.updateEntity).mockResolvedValue(entity({ name: 'Driftwake GDD' }));
    renderSwitcher(entity());
    await openSwitcher();

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('Document name');
    fireEvent.change(input, { target: { value: 'Driftwake GDD' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(api.updateEntity).toHaveBeenCalledWith('prj_1', 'doc_1', { name: 'Driftwake GDD' }),
    );
  });

  it('does not rename when Escape cancels the edit', async () => {
    renderSwitcher(entity());
    await openSwitcher();

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('Document name');
    fireEvent.change(input, { target: { value: 'Abandoned edit' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.getByRole('button', { name: 'Rename' })).toBeDefined();
    expect(api.updateEntity).not.toHaveBeenCalled();
  });

  it('archives the current document', async () => {
    vi.mocked(api.archiveEntity).mockResolvedValue(entity({ status: 'archived' }));
    renderSwitcher(entity());
    await openSwitcher();

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(api.archiveEntity).toHaveBeenCalledWith('prj_1', 'doc_1'));
  });

  it('offers Restore instead of Archive for an archived document, and disables Rename', async () => {
    const archived = entity({ status: 'archived', archivedAt: new Date() });
    vi.mocked(api.restoreEntity).mockResolvedValue(entity({ status: 'active' }));
    renderSwitcher(archived);
    await openSwitcher();

    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Rename' })).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(api.restoreEntity).toHaveBeenCalledWith('prj_1', 'doc_1'));
  });
});
