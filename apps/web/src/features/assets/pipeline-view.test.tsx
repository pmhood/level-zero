// @vitest-environment jsdom
import type { Asset, AssetLibraryPage, AssetSummary } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PipelineView } from './pipeline-view';

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

function renderView(onDrillIntoStage = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <PipelineView projectId="prj_1" listParams={{}} onDrillIntoStage={onDrillIntoStage} />
    </QueryClientProvider>,
  );

  return { ...utils, onDrillIntoStage };
}

describe('PipelineView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('groups assets by stage, one section per stage', async () => {
    vi.mocked(api.listAssetLibrary).mockImplementation((_projectId, params) => {
      if (params?.pipelineStages?.includes('concept')) {
        return Promise.resolve(libraryPage([asset()], [summary()]));
      }
      return Promise.resolve(libraryPage([], []));
    });

    renderView();

    await waitFor(() => expect(screen.getByText('Concept')).toBeDefined());
    expect(screen.getByText('In Progress')).toBeDefined();
    expect(screen.getByText('Production Ready')).toBeDefined();

    // Only the stage with an asset renders it; the other two stay empty.
    await screen.findByText('kael-suit.png');
    expect(screen.getAllByText('No assets in this stage yet')).toHaveLength(2);
  });

  it('renders an empty stage honestly rather than breaking', async () => {
    vi.mocked(api.listAssetLibrary).mockResolvedValue(libraryPage([], []));

    renderView();

    await waitFor(() => expect(screen.getAllByText('No assets in this stage yet')).toHaveLength(3));
  });

  it('drills into the Grid view filtered to a stage when a tile is clicked', async () => {
    vi.mocked(api.listAssetLibrary).mockImplementation((_projectId, params) => {
      if (params?.pipelineStages?.includes('concept')) {
        return Promise.resolve(libraryPage([asset()], [summary()]));
      }
      return Promise.resolve(libraryPage([], []));
    });
    const onDrillIntoStage = vi.fn();

    renderView(onDrillIntoStage);

    const tile = await screen.findByRole('button', { name: 'kael-suit.png' });
    fireEvent.click(tile);

    expect(onDrillIntoStage).toHaveBeenCalledWith('concept');
  });

  it('offers a "View in Grid" action for a stage that has assets', async () => {
    vi.mocked(api.listAssetLibrary).mockImplementation((_projectId, params) => {
      if (params?.pipelineStages?.includes('concept')) {
        return Promise.resolve(libraryPage([asset()], [summary()]));
      }
      return Promise.resolve(libraryPage([], []));
    });
    const onDrillIntoStage = vi.fn();

    renderView(onDrillIntoStage);

    const button = await screen.findByRole('button', { name: 'View in Grid' });
    fireEvent.click(button);

    expect(onDrillIntoStage).toHaveBeenCalledWith('concept');
  });
});
