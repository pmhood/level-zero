// @vitest-environment jsdom
import type { Asset, AssetLibraryPage, AssetSummary } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetsWorkspace } from './assets-workspace';

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  listAssetLibrary: vi.fn(),
  assetContentUrl: (projectId: string, assetId: string) =>
    `https://api.test/projects/${projectId}/assets/${assetId}/content`,
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
    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([], []));
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
    expect(screen.getByText('Approved')).toBeDefined();
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
});

async function waitForCall(times = 1) {
  await waitFor(() => {
    expect(vi.mocked(api.listAssetLibrary).mock.calls.length).toBeGreaterThanOrEqual(times);
  });
}
