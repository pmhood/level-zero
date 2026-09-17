// @vitest-environment jsdom
import type {
  DocumentContent,
  DocumentHistory,
  DocumentVersion,
  DocumentVersionSnapshot,
  Generation,
} from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GddHistory } from './gdd-history';

vi.mock('@/lib/api', () => ({
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  listDocumentVersions: vi.fn(),
  getDocumentVersion: vi.fn(),
  restoreDocumentVersion: vi.fn(),
  snapshotDocument: vi.fn(),
  getGeneration: vi.fn(),
  getGenerationProvenance: vi.fn(),
}));

const api = await import('@/lib/api');

function docVersion(
  id: string,
  versionNumber: number,
  overrides: Partial<DocumentVersion> = {},
): DocumentVersion {
  return {
    id,
    documentId: 'doc_1',
    versionNumber,
    name: null,
    reason: 'manual',
    generationId: null,
    parentVersionId: null,
    createdBy: null,
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    isCurrent: false,
    ...overrides,
  };
}

function history(versions: DocumentVersion[], currentVersionId: string | null): DocumentHistory {
  return { documentId: 'doc_1', currentVersionId, versions, total: versions.length };
}

function bodyWithText(text: string): DocumentContent {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

function versionSnapshot(version: DocumentVersion, text: string): DocumentVersionSnapshot {
  return { ...version, title: 'GDD', content: bodyWithText(text) };
}

function generation(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'gen_1',
    projectId: 'prj_1',
    capability: 'text.generate',
    provider: 'anthropic',
    model: 'claude',
    prompt: 'Expand the intro',
    parameters: {},
    status: 'complete',
    inputEntityIds: [],
    inputAssetIds: [],
    contextEntityIds: [],
    resolvedContext: null,
    outputAssetIds: [],
    parentGenerationId: null,
    seed: null,
    providerRequestId: null,
    failure: null,
    attempts: [],
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    startedAt: new Date('2026-03-01T09:00:00.000Z'),
    completedAt: new Date('2026-03-01T09:00:05.000Z'),
    createdBy: null,
    ...overrides,
  };
}

function renderHistory(
  overrides: Partial<{
    archived: boolean;
    onCompare: () => void;
    onRestored: (content: DocumentContent) => void;
    flush: () => Promise<void>;
  }> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const archived = overrides.archived ?? false;
  const onCompare = overrides.onCompare ?? vi.fn();
  const onRestored = overrides.onRestored ?? vi.fn();
  const flush = overrides.flush ?? vi.fn().mockResolvedValue(undefined);

  render(
    <QueryClientProvider client={queryClient}>
      <GddHistory
        projectId="prj_1"
        documentId="doc_1"
        archived={archived}
        flush={flush}
        onCompare={onCompare}
        onRestored={onRestored}
      />
    </QueryClientProvider>,
  );

  return { onCompare, onRestored, flush };
}

describe('GDD history panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getGenerationProvenance).mockResolvedValue({
      generation: generation(),
      parent: null,
      inputEntities: [],
      contextEntities: [],
      inputAssets: [],
      outputAssets: [],
    });
  });

  afterEach(cleanup);

  it('lists every version newest first, with its number, name, reason and timestamp', async () => {
    vi.mocked(api.listDocumentVersions).mockResolvedValue(
      history(
        [
          docVersion('ver_2', 2, {
            name: 'Vertical slice review',
            reason: 'milestone',
            isCurrent: true,
          }),
          docVersion('ver_1', 1, { name: null, reason: 'manual' }),
        ],
        'ver_2',
      ),
    );

    renderHistory();

    expect(await screen.findByText('v2 · Vertical slice review')).toBeTruthy();
    expect(screen.getByText('v1 · Unnamed version')).toBeTruthy();
    expect(screen.getByText(/Milestone/)).toBeTruthy();
    expect(screen.getByText(/Saved/)).toBeTruthy();
    expect(screen.getByText('Current')).toBeTruthy();
  });

  it('marks an AI-edit version and reaches the generation that produced it', async () => {
    vi.mocked(api.listDocumentVersions).mockResolvedValue(
      history(
        [
          docVersion('ver_1', 1, {
            name: 'AI edit — expand the intro',
            reason: 'ai_edit',
            generationId: 'gen_1',
            isCurrent: true,
          }),
        ],
        'ver_1',
      ),
    );
    vi.mocked(api.getGeneration).mockResolvedValue(generation());

    renderHistory();

    expect(await screen.findByText('AI edit')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Show the generation' }));

    await waitFor(() => expect(api.getGeneration).toHaveBeenCalledWith('prj_1', 'gen_1'));
    expect(await screen.findByText('Expand the intro')).toBeTruthy();
  });

  it('reads a version in place, without leaving the document', async () => {
    const version = docVersion('ver_1', 1, { name: 'Draft', isCurrent: true });
    vi.mocked(api.listDocumentVersions).mockResolvedValue(history([version], 'ver_1'));
    vi.mocked(api.getDocumentVersion).mockResolvedValue(
      versionSnapshot(version, 'Dive deeper, faster.'),
    );

    renderHistory();

    fireEvent.click(await screen.findByRole('button', { name: 'Read' }));

    await waitFor(() =>
      expect(api.getDocumentVersion).toHaveBeenCalledWith('prj_1', 'doc_1', 'ver_1'),
    );
    await waitFor(() =>
      expect(screen.getAllByText('Dive deeper, faster.').length).toBeGreaterThan(0),
    );
  });

  it('enters the compare mode the workspace already has', async () => {
    vi.mocked(api.listDocumentVersions).mockResolvedValue(
      history([docVersion('ver_1', 1, { isCurrent: true })], 'ver_1'),
    );
    const { onCompare } = renderHistory();

    fireEvent.click(await screen.findByRole('button', { name: 'Compare versions' }));

    expect(onCompare).toHaveBeenCalledTimes(1);
  });

  it('names a snapshot when saving it, flushing autosave first', async () => {
    vi.mocked(api.listDocumentVersions).mockResolvedValue(history([], null));
    vi.mocked(api.snapshotDocument).mockResolvedValue(
      docVersion('ver_1', 1, { name: 'Vertical slice review', isCurrent: true }),
    );
    const flush = vi.fn().mockResolvedValue(undefined);
    renderHistory({ flush });

    await screen.findByText(/No versions yet/);
    fireEvent.change(screen.getByLabelText('Save a version'), {
      target: { value: 'Vertical slice review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save a version' }));

    await waitFor(() =>
      expect(api.snapshotDocument).toHaveBeenCalledWith('prj_1', 'doc_1', {
        name: 'Vertical slice review',
      }),
    );
    expect(flush).toHaveBeenCalled();
  });

  it('restores a version, says plainly that later history stays, and keeps it', async () => {
    const current = docVersion('ver_2', 2, { name: 'Current draft', isCurrent: true });
    const older = docVersion('ver_1', 1, { name: 'Original', isCurrent: false });
    vi.mocked(api.listDocumentVersions)
      .mockResolvedValueOnce(history([current, older], 'ver_2'))
      .mockResolvedValueOnce(
        history(
          [
            docVersion('ver_3', 3, { name: null, reason: 'restore', isCurrent: true }),
            { ...current, isCurrent: false },
            older,
          ],
          'ver_3',
        ),
      );
    vi.mocked(api.getDocumentVersion).mockResolvedValue(versionSnapshot(older, 'Original text.'));
    vi.mocked(api.restoreDocumentVersion).mockResolvedValue(
      docVersion('ver_3', 3, { reason: 'restore', isCurrent: true }),
    );
    const flush = vi.fn().mockResolvedValue(undefined);
    const onRestored = vi.fn();
    renderHistory({ flush, onRestored });

    await screen.findByText('v2 · Current draft');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(await screen.findByText(/Nothing written since is lost/)).toBeTruthy();

    const confirm = (await screen.findByRole('button', {
      name: 'Restore this version',
    })) as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(api.restoreDocumentVersion).toHaveBeenCalledWith('prj_1', 'doc_1', 'ver_1'),
    );
    expect(flush).toHaveBeenCalled();
    await waitFor(() => expect(onRestored).toHaveBeenCalledWith(bodyWithText('Original text.')));

    // The two versions that existed before the restore are still there,
    // alongside the new one restoring appended — nothing was truncated.
    expect(await screen.findByText('v3 · Unnamed version')).toBeTruthy();
    expect(screen.getByText('v2 · Current draft')).toBeTruthy();
    expect(screen.getByText('v1 · Original')).toBeTruthy();
  });

  it('reads and compares an archived document, but does not offer to snapshot or restore it', async () => {
    const version = docVersion('ver_1', 1, { name: 'Draft', isCurrent: true });
    vi.mocked(api.listDocumentVersions).mockResolvedValue(history([version], 'ver_1'));
    vi.mocked(api.getDocumentVersion).mockResolvedValue(
      versionSnapshot(version, 'Frozen writing.'),
    );
    const { onCompare } = renderHistory({ archived: true });

    await screen.findByText('v1 · Draft');

    // No way to write a new version of a document that is read-only server-side.
    expect(screen.queryByLabelText('Save a version')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();

    // Reading and comparing stay available either way.
    fireEvent.click(screen.getByRole('button', { name: 'Compare versions' }));
    expect(onCompare).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    await waitFor(() => expect(screen.getAllByText('Frozen writing.').length).toBeGreaterThan(0));
  });
});
