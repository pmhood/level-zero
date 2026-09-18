// @vitest-environment jsdom
import type { Asset, AssetLibraryPage, AssetSummary } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PipelineStrip } from './pipeline-strip';

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  listAssetLibrary: vi.fn(),
  getAssetPipelineStageCounts: vi.fn(),
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

function libraryPage(items: Asset[], summaries: AssetSummary[]): AssetLibraryPage {
  return { items, summaries, total: items.length };
}

function renderStrip(onSelectStage = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <PipelineStrip projectId="prj_1" selectedStage={null} onSelectStage={onSelectStage} />
    </QueryClientProvider>,
  );

  return { ...utils, onSelectStage };
}

describe('PipelineStrip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([], []));
  });

  afterEach(cleanup);

  it('shows each stage with its server-side count', async () => {
    vi.mocked(api.getAssetPipelineStageCounts).mockResolvedValue({
      concept: 3,
      in_progress: 1,
      production_ready: 0,
    });

    renderStrip();

    await waitFor(() => expect(screen.getByText('Concept')).toBeDefined());
    expect(screen.getByText('3 assets')).toBeDefined();
    expect(screen.getByText('In Progress')).toBeDefined();
    expect(screen.getByText('1 asset')).toBeDefined();
    expect(screen.getByText('Production Ready')).toBeDefined();
  });

  it('renders a stage with no assets honestly rather than breaking the strip', async () => {
    vi.mocked(api.getAssetPipelineStageCounts).mockResolvedValue({ concept: 2 });

    renderStrip();

    await waitFor(() => expect(screen.getByText('Production Ready')).toBeDefined());
    const card = screen.getByRole('button', { name: 'Production Ready: 0 assets' });
    expect(within(card).getByText('No preview')).toBeDefined();
    expect(within(card).getByText('0 assets')).toBeDefined();
  });

  it('shows a representative thumbnail for a stage with assets', async () => {
    vi.mocked(api.getAssetPipelineStageCounts).mockResolvedValue({ concept: 1 });
    vi.mocked(api.listAssetLibrary).mockImplementation((_projectId, params) => {
      if (params?.pipelineStages?.includes('concept')) {
        return Promise.resolve(libraryPage([asset()], [summary()]));
      }
      return Promise.resolve(libraryPage([], []));
    });

    renderStrip();

    const card = await screen.findByRole('button', { name: 'Concept: 1 asset' });
    const img = await within(card).findByRole('img');
    expect(img.getAttribute('src')).toContain('ast_1');
  });

  it('filters the library by clicking a stage', async () => {
    vi.mocked(api.getAssetPipelineStageCounts).mockResolvedValue({ concept: 3 });
    const onSelectStage = vi.fn();

    renderStrip(onSelectStage);

    const card = await screen.findByRole('button', { name: 'Concept: 3 assets' });
    fireEvent.click(card);

    expect(onSelectStage).toHaveBeenCalledWith('concept');
  });

  it('shows an error state with a retry when the counts fail to load', async () => {
    vi.mocked(api.getAssetPipelineStageCounts).mockRejectedValue(new Error('network down'));

    renderStrip();

    await waitFor(() => expect(screen.getByText("Couldn't load the pipeline")).toBeDefined());
    expect(screen.getByText('network down')).toBeDefined();
  });
});
