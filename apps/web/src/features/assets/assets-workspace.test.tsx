// @vitest-environment jsdom
import type { Asset, AssetLibraryPage, Entity, AssetSummary } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetsWorkspace } from './assets-workspace';

let currentSearch = '';
const routerReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
  usePathname: () => '/projects/prj_1/assets',
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  listAssetLibrary: vi.fn(),
  getAssetPipelineStageCounts: vi.fn(),
  listEntities: vi.fn(),
  getEntity: vi.fn(),
  collectionCounts: vi.fn(),
  collectionCovers: vi.fn(),
  assetContentUrl: (projectId: string, assetId: string) =>
    `https://api.test/projects/${projectId}/assets/${assetId}/content`,
  assetDownloadUrl: (projectId: string, assetId: string) =>
    `https://api.test/projects/${projectId}/assets/${assetId}/content?download=true`,
  // Read by the inspector the moment a tile is selected.
  listGenerationsForAsset: vi.fn(),
  listGenerations: vi.fn(),
  getGeneration: vi.fn(),
  getGenerationProvenance: vi.fn(),
  getAsset: vi.fn(),
  listAssets: vi.fn(),
  archiveAsset: vi.fn(),
  restoreAsset: vi.fn(),
  uploadAsset: vi.fn(),
  listAssetSelectionsForAsset: vi.fn(),
  getAssetSelectionSummary: vi.fn(),
  listAssetMarks: vi.fn(),
  approveAssetSelection: vi.fn(),
  rejectAssetSelection: vi.fn(),
  markAsset: vi.fn(),
  unmarkAsset: vi.fn(),
}));

// The real module decodes images/media through browser APIs jsdom doesn't
// implement; the workspace's own job is wiring the drop target and button to
// the queue, so these tests stub the decoding rather than faking it.
vi.mock('./asset-upload', () => ({
  checkFile: vi.fn(() => ({ kind: 'image' })),
  readFileMetadata: vi.fn(async () => ({})),
  readFileAsBase64: vi.fn(async () => 'cHJldGVuZCBieXRlcw=='),
}));

const api = await import('@/lib/api');

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'ast_1',
    projectId: 'prj_1',
    kind: 'image',
    filename: 'kael-suit.png',
    mimeType: 'image/png',
    byteSize: 2_048_000,
    storageKey: 'projects/prj_1/assets/ast_1',
    checksum: 'abc123',
    width: 1920,
    height: 1080,
    durationSeconds: null,
    variant: 'source',
    sourceAssetId: null,
    status: 'active',
    pipelineStage: 'concept',
    createdAt: new Date('2026-01-10T12:00:00Z'),
    updatedAt: new Date('2026-01-10T12:00:00Z'),
    archivedAt: null,
    createdBy: null,
    ...overrides,
  };
}

function summary(overrides: Partial<AssetSummary> = {}): AssetSummary {
  return {
    assetId: overrides.assetId ?? 'ast_1',
    origin: 'imported',
    generation: null,
    markKinds: [],
    selections: [],
    approved: false,
    linkedEntities: { entities: [], total: 0 },
    thumbnailAssetId: null,
    ...overrides,
  };
}

function libraryPage(
  items: Asset[],
  summaries: AssetSummary[],
  total = items.length,
): AssetLibraryPage {
  return { items, summaries, total };
}

function collectionEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'col_1',
    projectId: 'prj_1',
    type: 'asset_collection',
    name: 'Props & Gear',
    description: null,
    status: 'active',
    tags: [],
    data: {},
    currentVersionId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    archivedAt: null,
    ...overrides,
  };
}

/** Routes `listEntities` by its `type` filter, the way the real API narrows collections from every other entity type. */
function mockCollections(collections: Entity[]) {
  vi.mocked(api.listEntities).mockImplementation(async (_projectId, params) => {
    if (params?.type?.includes('asset_collection')) {
      return { items: collections, total: collections.length };
    }
    return { items: [], total: 0 };
  });
}

function renderWorkspace(projectId = 'prj_1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AssetsWorkspace projectId={projectId} />
    </QueryClientProvider>,
  );
}

describe('Assets workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    currentSearch = '';
    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([], []));
    vi.mocked(api.getAssetPipelineStageCounts).mockResolvedValue({});
    vi.mocked(api.listEntities).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(api.getEntity).mockRejectedValue(new Error('not found'));
    vi.mocked(api.collectionCounts).mockResolvedValue({});
    vi.mocked(api.collectionCovers).mockResolvedValue({});
    vi.mocked(api.listGenerationsForAsset).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(api.listGenerations).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(api.listAssets).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(api.listAssetSelectionsForAsset).mockResolvedValue([]);
    vi.mocked(api.listAssetMarks).mockResolvedValue([]);
  });

  afterEach(cleanup);

  it('shows a loading grid while the first page loads', () => {
    vi.mocked(api.listAssetLibrary).mockReturnValue(new Promise(() => {}));

    renderWorkspace();

    expect(screen.getByRole('status', { name: 'Loading assets' })).toBeDefined();
    expect(screen.queryByText('No assets yet')).toBeNull();
  });

  it('says what went wrong and offers a retry when the library cannot be read', async () => {
    vi.mocked(api.listAssetLibrary).mockRejectedValue(new Error('Service unavailable'));

    renderWorkspace();

    await screen.findByText("Couldn't load the asset library");
    expect(screen.getByText('Service unavailable')).toBeDefined();

    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([asset()], [summary()]));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('kael-suit.png');
  });

  it('invites uploading or generating when the project has no assets', async () => {
    renderWorkspace();

    await screen.findByText('No assets yet');
  });

  it('scopes the query to the project the workspace was given', async () => {
    renderWorkspace('prj_belt');

    await waitForCall();
    expect(vi.mocked(api.listAssetLibrary).mock.calls[0]![0]).toBe('prj_belt');
  });

  it('renders the grid by default, with the badge #170 derives and the server-side total', async () => {
    vi.mocked(api.listAssetLibrary).mockResolvedValue(
      libraryPage([asset()], [summary({ approved: true })], 342),
    );

    renderWorkspace();

    await screen.findByText('kael-suit.png');
    expect(screen.getByText('All Assets (342)')).toBeDefined();
    expect(screen.getByText('Approved', { selector: 'span' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'kael-suit.png' })).toBeDefined();
  });

  it('gives a non-visual asset a type-appropriate placeholder instead of a broken image', async () => {
    const sonar = asset({
      id: 'ast_2',
      filename: 'sonar-ping.wav',
      kind: 'audio',
      mimeType: 'audio/wav',
      width: null,
      height: null,
      durationSeconds: 4,
    });
    vi.mocked(api.listAssetLibrary).mockResolvedValue(
      libraryPage([sonar], [summary({ assetId: 'ast_2' })]),
    );

    renderWorkspace();

    await screen.findByText('sonar-ping.wav');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('falls back to the kind placeholder when an image asset has a missing storage reference', async () => {
    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([asset()], [summary()]));

    renderWorkspace();

    const img = await screen.findByRole('img', { name: 'kael-suit.png' });
    fireEvent.error(img);

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('kael-suit.png')).toBeDefined();
  });

  it('hides archived assets by default, matching the API default', async () => {
    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([asset()], [summary()]));

    renderWorkspace();

    await screen.findByText('kael-suit.png');
    expect(vi.mocked(api.listAssetLibrary).mock.calls[0]![1]).toMatchObject({
      includeArchived: false,
    });
  });

  it('includes archived assets, badged Archived, once the toolbar checkbox is checked', async () => {
    const archived = asset({ id: 'ast_3', filename: 'retired-crate.png', status: 'archived' });
    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([], []));

    renderWorkspace();
    await screen.findByText('No assets yet');

    vi.mocked(api.listAssetLibrary).mockResolvedValue(
      libraryPage([archived], [summary({ assetId: 'ast_3' })]),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include archived' }));

    await screen.findByText('retired-crate.png');
    expect(screen.getByText('Archived')).toBeDefined();
    expect(vi.mocked(api.listAssetLibrary).mock.calls.at(-1)![1]).toMatchObject({
      includeArchived: true,
    });
  });

  it('switches to the list view and shows the same badge column', async () => {
    vi.mocked(api.listAssetLibrary).mockResolvedValue(
      libraryPage([asset()], [summary({ origin: 'generated' })]),
    );

    renderWorkspace();
    await screen.findByText('kael-suit.png');

    fireEvent.click(screen.getByRole('button', { name: 'List' }));

    const table = screen.getByRole('table', { name: 'Assets' });
    expect(within(table).getByText('kael-suit.png')).toBeDefined();
    expect(within(table).getByText('image/png')).toBeDefined();
    expect(within(table).getByText('Generated')).toBeDefined();
  });

  it('persists the view choice across a remount', async () => {
    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([asset()], [summary()]));

    const { unmount } = renderWorkspace();
    await screen.findByText('kael-suit.png');
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    await screen.findByRole('table', { name: 'Assets' });
    unmount();

    renderWorkspace();
    await screen.findByRole('table', { name: 'Assets' });
  });

  it('highlights the selected tile without navigating anywhere', async () => {
    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([asset()], [summary()]));

    renderWorkspace();
    const tile = await screen.findByRole('button', { name: 'kael-suit.png' });

    fireEvent.click(tile);
    expect(tile.getAttribute('aria-pressed')).toBe('true');
  });

  it('opens the inspector beside the grid for the selected asset, and closes it again', async () => {
    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([asset()], [summary()]));

    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'kael-suit.png' }));

    const inspector = await screen.findByRole('complementary');
    expect(within(inspector).getByRole('heading', { name: 'kael-suit.png' })).toBeDefined();
    expect(within(inspector).getByRole('tab', { name: 'Overview' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Close inspector' }));
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('pages server-side rather than slicing a fetched list on the client', async () => {
    const items = Array.from({ length: 60 }, (_, index) =>
      asset({ id: `ast_${index}`, filename: `asset-${index}.png` }),
    );
    const summaries = items.map((item) => summary({ assetId: item.id }));
    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage(items, summaries, 120));

    renderWorkspace();
    await screen.findByText('All Assets (120)');

    expect(screen.getByRole('button', { name: 'Previous' })).toHaveProperty('disabled', true);
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toHaveProperty('disabled', false);

    const secondPage = items.map((item) =>
      asset({ id: `ast_p2_${item.id}`, filename: `page2-${item.filename}` }),
    );
    vi.mocked(api.listAssetLibrary).mockResolvedValue(
      libraryPage(
        secondPage,
        secondPage.map((item) => summary({ assetId: item.id })),
        120,
      ),
    );
    fireEvent.click(next);

    await waitForCall(2);
    expect(vi.mocked(api.listAssetLibrary).mock.calls[1]![1]).toMatchObject({
      offset: 60,
      limit: 60,
    });
  });

  it('reads its filters back out of a pasted URL and queries with them from the first request', async () => {
    currentSearch = 'kind=image&origin=generated&sort=filename';
    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([asset()], [summary()]));

    renderWorkspace();

    await waitForCall();
    expect(vi.mocked(api.listAssetLibrary).mock.calls[0]![1]).toMatchObject({
      kind: ['image'],
      origin: 'generated',
      sortBy: 'filename',
      sortDirection: 'asc',
    });
  });

  it('re-queries with each filter as it changes, and resets to the first page', async () => {
    const items = Array.from({ length: 60 }, (_, index) =>
      asset({ id: `ast_${index}`, filename: `asset-${index}.png` }),
    );
    vi.mocked(api.listAssetLibrary).mockResolvedValue(
      libraryPage(
        items,
        items.map((item) => summary({ assetId: item.id })),
        120,
      ),
    );

    renderWorkspace();
    await screen.findByText('All Assets (120)');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitForCall(2);

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'image' } });

    await waitForCall(3);
    const lastCall = vi.mocked(api.listAssetLibrary).mock.calls.at(-1)!;
    expect(lastCall[1]).toMatchObject({ kind: ['image'], offset: 0 });
  });

  it('writes a changed filter back into the URL', async () => {
    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([], []));

    renderWorkspace();
    await waitForCall();

    fireEvent.change(screen.getByLabelText('Origin'), { target: { value: 'imported' } });

    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith('/projects/prj_1/assets?origin=imported', {
        scroll: false,
      }),
    );
  });

  it('distinguishes no assets in the project from no assets matching the filters', async () => {
    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([], []));

    renderWorkspace();
    await screen.findByText('No assets yet');

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'video' } });

    await screen.findByText('No assets match these filters');
    expect(screen.queryByText('No assets yet')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    await screen.findByText('No assets yet');
  });

  it('uploads a file dropped onto the library and shows it in the grid without a full reload', async () => {
    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([], []));
    renderWorkspace();
    await screen.findByText('No assets yet');

    const uploaded = asset({ id: 'ast_new', filename: 'new-concept.png' });
    vi.mocked(api.uploadAsset).mockResolvedValue(uploaded);
    vi.mocked(api.listAssetLibrary).mockResolvedValue(
      libraryPage([uploaded], [summary({ assetId: 'ast_new' })]),
    );

    const dropZone = screen.getByTestId('asset-library-dropzone');
    const file = new File(['bytes'], 'new-concept.png', { type: 'image/png' });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file], types: ['Files'] } });

    await screen.findByText('Uploaded');
    // The queue drove the same query key `useArchiveAsset`/`useRestoreAsset`
    // invalidate — a fresh fetch, not a client-side splice of the old page —
    // so the new asset shows up as its own grid tile, not just a queue row.
    await screen.findByRole('button', { name: 'new-concept.png' });
  });

  it('uploads a file chosen through the picker button', async () => {
    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([], []));
    renderWorkspace();
    await screen.findByText('No assets yet');

    vi.mocked(api.uploadAsset).mockResolvedValue(asset({ filename: 'picked.png' }));

    const file = new File(['bytes'], 'picked.png', { type: 'image/png' });
    const input = screen.getByLabelText('Upload files', { selector: 'input' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(api.uploadAsset).toHaveBeenCalled());
    expect(vi.mocked(api.uploadAsset).mock.calls[0]![0]).toBe('prj_1');
    expect(vi.mocked(api.uploadAsset).mock.calls[0]![1]).toMatchObject({ filename: 'picked.png' });
  });

  it('keeps a failed upload visible with its own error, retryable, without losing other uploads', async () => {
    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([], []));
    renderWorkspace();
    await screen.findByText('No assets yet');

    vi.mocked(api.uploadAsset).mockRejectedValueOnce(new Error('Service unavailable'));

    const dropZone = screen.getByTestId('asset-library-dropzone');
    const file = new File(['bytes'], 'flaky.png', { type: 'image/png' });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file], types: ['Files'] } });

    await screen.findByText('Service unavailable');
    expect(screen.getByText('Failed')).toBeDefined();

    vi.mocked(api.uploadAsset).mockResolvedValueOnce(asset({ filename: 'flaky.png' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await screen.findByText('Uploaded');
  });

  describe('multi-select and bulk actions', () => {
    function fourAssets() {
      return [
        asset({ id: 'ast_1', filename: 'a.png' }),
        asset({ id: 'ast_2', filename: 'b.png' }),
        asset({ id: 'ast_3', filename: 'c.png' }),
        asset({ id: 'ast_4', filename: 'd.png' }),
      ];
    }

    async function renderWithFourAssets(summaries?: AssetSummary[]) {
      const items = fourAssets();
      vi.mocked(api.listAssetLibrary).mockResolvedValue(
        libraryPage(items, summaries ?? items.map((item) => summary({ assetId: item.id }))),
      );
      renderWorkspace();
      await screen.findByText('a.png');
      return items;
    }

    it('extends a range with shift-click', async () => {
      await renderWithFourAssets();

      fireEvent.click(screen.getByRole('button', { name: 'a.png' }));
      fireEvent.click(screen.getByRole('button', { name: 'c.png' }), { shiftKey: true });

      expect(await screen.findByText('3 selected')).toBeDefined();
      expect(screen.getByRole('button', { name: 'a.png' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      expect(screen.getByRole('button', { name: 'b.png' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      expect(screen.getByRole('button', { name: 'c.png' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      expect(screen.getByRole('button', { name: 'd.png' }).getAttribute('aria-pressed')).toBe(
        'false',
      );
    });

    it('adds one to the selection with cmd/ctrl-click, leaving the rest untouched', async () => {
      await renderWithFourAssets();

      fireEvent.click(screen.getByRole('button', { name: 'a.png' }));
      fireEvent.click(screen.getByRole('button', { name: 'c.png' }), { ctrlKey: true });

      expect(await screen.findByText('2 selected')).toBeDefined();
      expect(screen.getByRole('button', { name: 'b.png' }).getAttribute('aria-pressed')).toBe(
        'false',
      );
    });

    it('selects every loaded asset from the header control, and clears from the same place', async () => {
      await renderWithFourAssets();

      fireEvent.click(screen.getByRole('button', { name: 'Select all 4' }));
      expect(await screen.findByText('4 selected')).toBeDefined();

      fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
      expect(screen.queryByText('4 selected')).toBeNull();
    });

    it('clears the selection on Escape', async () => {
      await renderWithFourAssets();

      fireEvent.click(screen.getByRole('button', { name: 'a.png' }));
      fireEvent.click(screen.getByRole('button', { name: 'c.png' }), { shiftKey: true });
      await screen.findByText('3 selected');

      fireEvent.keyDown(screen.getByTestId('asset-library-dropzone'), { key: 'Escape' });

      expect(screen.queryByText('3 selected')).toBeNull();
    });

    it('shows a selection summary, never one asset standing in for the group, once more than one is selected', async () => {
      await renderWithFourAssets();

      fireEvent.click(screen.getByRole('button', { name: 'a.png' }));
      fireEvent.click(screen.getByRole('button', { name: 'b.png' }), { ctrlKey: true });

      const inspector = await screen.findByRole('complementary');
      expect(within(inspector).getByText('2 assets selected')).toBeDefined();
      expect(within(inspector).queryByRole('tab', { name: 'Overview' })).toBeNull();
    });

    it('bulk-favorites every selected asset, then bulk-unfavorites once every one already carries the mark', async () => {
      const items = fourAssets();
      // A small fake backend: `listAssetLibrary` always reads back whatever
      // `markAsset`/`unmarkAsset` last recorded, so the round trip through
      // the read model (#200's `markKinds`) is real rather than a second,
      // separately-scripted response the UI never actually earned.
      const marks = new Set<string>();
      vi.mocked(api.listAssetLibrary).mockImplementation(async () =>
        libraryPage(
          items,
          items.map((item) =>
            summary({ assetId: item.id, markKinds: marks.has(item.id) ? ['favorite'] : [] }),
          ),
        ),
      );
      vi.mocked(api.markAsset).mockImplementation(async (_projectId, input) => {
        marks.add(input.assetId);
        return {
          id: `mark_${input.assetId}`,
          projectId: 'prj_1',
          assetId: input.assetId,
          kind: input.kind,
          actor: input.actor,
          markedAt: new Date(),
        };
      });
      vi.mocked(api.unmarkAsset).mockImplementation(async (_projectId, assetId) => {
        marks.delete(assetId);
      });

      renderWorkspace();
      await screen.findByText('a.png');

      fireEvent.click(screen.getByRole('button', { name: 'a.png' }));
      fireEvent.click(screen.getByRole('button', { name: 'b.png' }), { ctrlKey: true });
      await screen.findByText('2 selected');

      fireEvent.click(screen.getByRole('button', { name: 'Favorite' }));

      await waitFor(() => expect(api.markAsset).toHaveBeenCalledTimes(2));
      expect(vi.mocked(api.markAsset).mock.calls[0]![0]).toBe('prj_1');
      expect(vi.mocked(api.markAsset).mock.calls[0]![1]).toMatchObject({
        assetId: 'ast_1',
        kind: 'favorite',
      });
      expect(vi.mocked(api.markAsset).mock.calls[1]![1]).toMatchObject({
        assetId: 'ast_2',
        kind: 'favorite',
      });

      // Both are now favorited in the read model the toggle reads its "on"
      // state from, so the same button unmarks them on the next click.
      const unfavorite = await screen.findByRole('button', { name: 'Unfavorite' });
      fireEvent.click(unfavorite);

      await waitFor(() => expect(api.unmarkAsset).toHaveBeenCalledTimes(2));
      expect(vi.mocked(api.unmarkAsset).mock.calls[0]).toEqual(['prj_1', 'ast_1', 'favorite']);
    });

    it('is harmless to bulk-mark the same selection twice', async () => {
      await renderWithFourAssets();
      vi.mocked(api.markAsset).mockResolvedValue({
        id: 'mark_1',
        projectId: 'prj_1',
        assetId: 'ast_1',
        kind: 'shortlisted',
        actor: 'You',
        markedAt: new Date(),
      });

      fireEvent.click(screen.getByRole('button', { name: 'a.png' }));
      fireEvent.click(screen.getByRole('button', { name: 'b.png' }), { ctrlKey: true });
      await screen.findByText('2 selected');

      const shortlist = screen.getByRole('button', { name: 'Shortlist' });
      fireEvent.click(shortlist);
      await waitFor(() => expect(api.markAsset).toHaveBeenCalledTimes(2));

      fireEvent.click(screen.getByRole('button', { name: 'Shortlist' }));
      await waitFor(() => expect(api.markAsset).toHaveBeenCalledTimes(4));

      expect(screen.queryByText(/Couldn.t apply/)).toBeNull();
    });

    it('bulk-archives every selected asset, then offers Restore once the whole selection is archived', async () => {
      const items = fourAssets();
      const archived = new Set<string>();
      vi.mocked(api.listAssetLibrary).mockImplementation(async () =>
        libraryPage(
          items.map((item) => ({
            ...item,
            status: archived.has(item.id) ? 'archived' : 'active',
          })),
          items.map((item) => summary({ assetId: item.id })),
        ),
      );
      vi.mocked(api.archiveAsset).mockImplementation(async (_projectId, assetId) => {
        archived.add(assetId);
        return asset({ id: assetId, status: 'archived' });
      });

      renderWorkspace();
      await screen.findByText('a.png');

      fireEvent.click(screen.getByRole('button', { name: 'a.png' }));
      fireEvent.click(screen.getByRole('button', { name: 'b.png' }), { ctrlKey: true });
      await screen.findByText('2 selected');

      fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

      await waitFor(() => expect(api.archiveAsset).toHaveBeenCalledTimes(2));
      expect(vi.mocked(api.archiveAsset).mock.calls[0]).toEqual(['prj_1', 'ast_1']);
      expect(vi.mocked(api.archiveAsset).mock.calls[1]).toEqual(['prj_1', 'ast_2']);

      await screen.findByRole('button', { name: 'Restore' });
      expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    });

    it("reports a bulk action's per-asset failures and narrows the selection to just those, so retrying only touches them", async () => {
      await renderWithFourAssets();
      vi.mocked(api.archiveAsset).mockImplementation(async (_projectId, assetId) => {
        if (assetId === 'ast_2' || assetId === 'ast_4') {
          throw new api.ApiRequestError('Asset is already archived', 409);
        }
        return asset({ id: assetId, status: 'archived' });
      });

      fireEvent.click(screen.getByRole('button', { name: 'Select all 4' }));
      await screen.findByText('4 selected');

      fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toMatch(/Couldn.t apply to 2 files/);
      expect(alert.textContent).toMatch(/b\.png/);
      expect(alert.textContent).toMatch(/d\.png/);
      // Only the two failures stay selected — the two that succeeded are done.
      expect(await screen.findByText('2 selected')).toBeDefined();
      expect(screen.queryByRole('button', { name: 'a.png' })!.getAttribute('aria-pressed')).toBe(
        'false',
      );
    });

    it('scopes every bulk request to the project the workspace was given', async () => {
      await renderWithFourAssets();
      vi.mocked(api.archiveAsset).mockImplementation(async (_projectId, assetId) =>
        asset({ id: assetId, status: 'archived' }),
      );

      fireEvent.click(screen.getByRole('button', { name: 'a.png' }));
      fireEvent.click(screen.getByRole('button', { name: 'b.png' }), { ctrlKey: true });
      await screen.findByText('2 selected');
      fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

      await waitFor(() => expect(api.archiveAsset).toHaveBeenCalledTimes(2));
      expect(vi.mocked(api.archiveAsset).mock.calls[0]![0]).toBe('prj_1');
      expect(vi.mocked(api.archiveAsset).mock.calls[1]![0]).toBe('prj_1');
    });
  });

  describe('Asset Pipeline (#230)', () => {
    it('shows the strip beneath the grid, with a server-side count per stage', async () => {
      vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([asset()], [summary()]));
      vi.mocked(api.getAssetPipelineStageCounts).mockResolvedValue({
        concept: 2,
        production_ready: 5,
      });

      renderWorkspace();

      await screen.findByText('Asset Pipeline');
      await screen.findByText('2 assets');
      expect(screen.getByText('5 assets')).toBeDefined();
      expect(screen.getByText('0 assets')).toBeDefined(); // in_progress: absent from the counts map
    });

    it('filters the grid to a stage when its card is clicked, and the header count reflects it', async () => {
      vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([asset()], [summary()], 342));
      vi.mocked(api.getAssetPipelineStageCounts).mockResolvedValue({ concept: 342 });

      renderWorkspace();
      await screen.findByText('All Assets (342)');

      fireEvent.click(screen.getByRole('button', { name: 'Concept: 342 assets' }));

      await waitFor(() =>
        expect(vi.mocked(api.listAssetLibrary).mock.calls.at(-1)![1]).toMatchObject({
          pipelineStages: ['concept'],
        }),
      );

      vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([asset()], [summary()], 342));
      await screen.findByText('All Assets (342)');
    });

    it('clears the stage filter on a second click of the same card', async () => {
      vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([asset()], [summary()]));
      vi.mocked(api.getAssetPipelineStageCounts).mockResolvedValue({ concept: 1 });

      renderWorkspace();

      const card = await screen.findByRole('button', { name: 'Concept: 1 asset' });
      fireEvent.click(card);
      await waitFor(() =>
        expect(vi.mocked(api.listAssetLibrary).mock.calls.at(-1)![1]).toMatchObject({
          pipelineStages: ['concept'],
        }),
      );

      fireEvent.click(card);
      await waitFor(() =>
        expect(vi.mocked(api.listAssetLibrary).mock.calls.at(-1)![1]).toMatchObject({
          pipelineStages: undefined,
        }),
      );
    });

    it('enables the Pipeline position in the switcher and groups assets by stage', async () => {
      vi.mocked(api.listAssetLibrary).mockImplementation((_projectId, params) => {
        if (params?.pipelineStages?.includes('concept')) {
          return Promise.resolve(libraryPage([asset()], [summary()]));
        }
        return Promise.resolve(libraryPage([], []));
      });
      vi.mocked(api.getAssetPipelineStageCounts).mockResolvedValue({ concept: 1 });

      renderWorkspace();
      await screen.findByText('No assets yet'); // the unfiltered grid, before any stage is chosen

      const pipelineButton = screen.getByRole('button', { name: 'Pipeline' });
      expect(pipelineButton).toHaveProperty('disabled', false);
      // Collections (#227) fills the switcher's other reserved slot.
      expect(screen.getByRole('button', { name: 'Collections' })).toHaveProperty('disabled', false);

      fireEvent.click(pipelineButton);

      await waitFor(() => expect(screen.getAllByText('kael-suit.png')).toHaveLength(1));
      expect(screen.getByText('In Progress')).toBeDefined();
      expect(screen.getByText('Production Ready')).toBeDefined();
      // The strip is a grid/list affordance — it does not also render under the Pipeline view.
      expect(screen.queryByText('Asset Pipeline')).toBeNull();
    });

    it('drilling into a stage from the Pipeline view switches to Grid, filtered', async () => {
      vi.mocked(api.listAssetLibrary).mockImplementation((_projectId, params) => {
        if (params?.pipelineStages?.includes('concept')) {
          return Promise.resolve(libraryPage([asset()], [summary()]));
        }
        return Promise.resolve(libraryPage([], []));
      });
      vi.mocked(api.getAssetPipelineStageCounts).mockResolvedValue({ concept: 1 });

      renderWorkspace();
      fireEvent.click(screen.getByRole('button', { name: 'Pipeline' }));

      const tile = await screen.findByRole('button', { name: 'kael-suit.png' });
      fireEvent.click(tile);

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Grid' }).getAttribute('aria-pressed')).toBe(
          'true',
        ),
      );
      await waitFor(() =>
        expect(vi.mocked(api.listAssetLibrary).mock.calls.at(-1)![1]).toMatchObject({
          pipelineStages: ['concept'],
        }),
      );
    });

    it('persists a choice of the Pipeline view across a remount', async () => {
      vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([], []));
      vi.mocked(api.getAssetPipelineStageCounts).mockResolvedValue({});

      const { unmount } = renderWorkspace();
      fireEvent.click(await screen.findByRole('button', { name: 'Pipeline' }));
      await screen.findAllByText('No assets in this stage yet');
      unmount();

      renderWorkspace();
      await screen.findAllByText('No assets in this stage yet');
      expect(screen.getByRole('button', { name: 'Pipeline' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
    });
  });

  describe('collections rail and view', () => {
    it('shows every collection with its count and cover, reading both from the read model', async () => {
      const props = collectionEntity({ id: 'col_props', name: 'Props & Gear' });
      const ui = collectionEntity({ id: 'col_ui', name: 'UI & HUD' });
      mockCollections([props, ui]);
      vi.mocked(api.collectionCounts).mockResolvedValue({ col_props: 92, col_ui: 1 });
      const cover = asset({ id: 'ast_cover', filename: 'crate.png' });
      vi.mocked(api.collectionCovers).mockResolvedValue({ col_props: cover });

      renderWorkspace();

      await screen.findByRole('heading', { name: 'Collections' });
      expect(screen.getByText('Props & Gear')).toBeDefined();
      expect(screen.getByText('92 assets')).toBeDefined();
      expect(screen.getByText('UI & HUD')).toBeDefined();
      expect(screen.getByText('1 asset')).toBeDefined();
      expect(screen.getByRole('img', { name: 'crate.png' })).toBeDefined();
    });

    it('says so when the project has no collections yet', async () => {
      mockCollections([]);

      renderWorkspace();

      await screen.findByText('No collections yet');
    });

    it('enables the Collections slot in the switcher, alongside Pipeline', async () => {
      mockCollections([]);
      renderWorkspace();
      await screen.findByText('No collections yet');

      const collectionsButton = screen.getByRole('button', { name: 'Collections' });
      const pipelineButton = screen.getByRole('button', { name: 'Pipeline' });
      expect(collectionsButton).toHaveProperty('disabled', false);
      expect(pipelineButton).toHaveProperty('disabled', false);
    });

    it('opens the Collections view from the switcher and groups assets by collection', async () => {
      const props = collectionEntity({ id: 'col_props', name: 'Props & Gear' });
      mockCollections([props]);
      vi.mocked(api.collectionCounts).mockResolvedValue({ col_props: 1 });
      vi.mocked(api.collectionCovers).mockResolvedValue({});
      const member = asset({ id: 'ast_crate', filename: 'crate.png' });
      vi.mocked(api.listAssetLibrary).mockImplementation(async (_projectId, params) => {
        if (params?.collectionId === 'col_props') {
          return libraryPage([member], [summary({ assetId: 'ast_crate' })], 1);
        }
        return libraryPage([], []);
      });

      renderWorkspace();
      fireEvent.click(await screen.findByRole('button', { name: 'Collections' }));

      await screen.findByRole('heading', { name: /Props & Gear/ });
      await screen.findByText('crate.png');
      // The rail is redundant once the Collections view is already grouping
      // by collection, so it steps aside rather than repeating the shelf.
      expect(screen.queryByRole('heading', { name: 'Collections' })).toBeNull();
    });

    it('opening the rail’s View All switches to the Collections view', async () => {
      mockCollections([collectionEntity()]);
      vi.mocked(api.collectionCounts).mockResolvedValue({ col_1: 1 });
      vi.mocked(api.collectionCovers).mockResolvedValue({});
      vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([], []));

      renderWorkspace();
      await screen.findByRole('heading', { name: 'Collections' });

      fireEvent.click(screen.getByRole('button', { name: 'View All' }));

      await screen.findByRole('heading', { name: /Props & Gear/ });
    });

    it('shows an empty state for a collection with no members, without hiding the others', async () => {
      const props = collectionEntity({ id: 'col_props', name: 'Props & Gear' });
      const empty = collectionEntity({ id: 'col_empty', name: 'Empty Board' });
      mockCollections([props, empty]);
      vi.mocked(api.collectionCounts).mockResolvedValue({ col_props: 1 });
      vi.mocked(api.collectionCovers).mockResolvedValue({});
      const member = asset({ id: 'ast_crate', filename: 'crate.png' });
      vi.mocked(api.listAssetLibrary).mockImplementation(async (_projectId, params) => {
        if (params?.collectionId === 'col_props') {
          return libraryPage([member], [summary({ assetId: 'ast_crate' })], 1);
        }
        return libraryPage([], []);
      });

      renderWorkspace();
      fireEvent.click(await screen.findByRole('button', { name: 'Collections' }));

      await screen.findByText('crate.png');
      expect(screen.getByText('No assets in this collection')).toBeDefined();
      expect(screen.getByRole('heading', { name: /Empty Board/ })).toBeDefined();
    });

    it('persists the Collections choice across a remount, alongside grid and list', async () => {
      mockCollections([]);
      const { unmount } = renderWorkspace();
      fireEvent.click(await screen.findByRole('button', { name: 'Collections' }));
      await screen.findByText('No collections yet');
      unmount();

      renderWorkspace();
      await screen.findByText('No collections yet');
      expect(screen.queryByRole('status', { name: 'Loading assets' })).toBeNull();
    });
  });
});

async function waitForCall(times = 1) {
  await waitFor(() => {
    expect(vi.mocked(api.listAssetLibrary).mock.calls.length).toBeGreaterThanOrEqual(times);
  });
}
