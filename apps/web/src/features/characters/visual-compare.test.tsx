// @vitest-environment jsdom
import type { Asset, Generation, GenerationPage } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VisualCompare } from './visual-compare';

vi.mock('@/lib/api', () => ({
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  assetContentUrl: (projectId: string, assetId: string) => `/assets/${projectId}/${assetId}`,
  listGenerationsForAsset: vi.fn(),
  listAssets: vi.fn(),
  getEntityNeighborhood: vi.fn(),
  createRelationship: vi.fn(),
  deleteRelationship: vi.fn(),
  listEntities: vi.fn(),
  getEntity: vi.fn(),
  createEntity: vi.fn(),
  updateEntity: vi.fn(),
  archiveEntity: vi.fn(),
  restoreEntity: vi.fn(),
  getEntityHistory: vi.fn(),
  commitEntityVersion: vi.fn(),
  restoreEntityVersion: vi.fn(),
  promoteEntity: vi.fn(),
}));

const api = await import('@/lib/api');

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'ast_1',
    projectId: 'prj_1',
    kind: 'image',
    filename: 'kael-portrait.png',
    mimeType: 'image/png',
    byteSize: 2048,
    storageKey: 'projects/prj_1/kael-portrait.png',
    checksum: 'abc',
    width: 1024,
    height: 1024,
    durationSeconds: null,
    variant: 'source',
    sourceAssetId: null,
    status: 'active',
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    updatedAt: new Date('2026-03-01T09:00:00.000Z'),
    archivedAt: null,
    createdBy: null,
    ...overrides,
  };
}

function generation(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'gen_1',
    projectId: 'prj_1',
    capability: 'image.generate',
    provider: 'openai',
    model: 'image-1',
    prompt: 'A rugged salvage diver, weathered helmet',
    parameters: {},
    status: 'complete',
    inputEntityIds: [],
    inputAssetIds: [],
    contextEntityIds: [],
    resolvedContext: null,
    outputAssetIds: ['ast_1'],
    parentGenerationId: null,
    seed: '1234',
    providerRequestId: null,
    failure: null,
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    createdBy: null,
    ...overrides,
  };
}

function page(items: Generation[]): GenerationPage {
  return { items, total: items.length };
}

const portrait = asset();
const variant = asset({ id: 'ast_2', filename: 'kael-outfit.png', width: 1536, height: 2048 });

function renderCompare(images: Asset[] = [portrait, variant]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <VisualCompare projectId="prj_1" images={images} onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

describe('Visual compare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listGenerationsForAsset).mockResolvedValue(page([]));
  });

  afterEach(cleanup);

  it('shows both pictures side by side', async () => {
    renderCompare();

    const a = within(await screen.findByRole('region', { name: 'Side A' }));
    const b = within(screen.getByRole('region', { name: 'Side B' }));

    expect(a.getByRole('img', { name: 'kael-portrait.png' })).toBeTruthy();
    expect(b.getByRole('img', { name: 'kael-outfit.png' })).toBeTruthy();
  });

  it('reads what a viewer cannot see from the pictures themselves', async () => {
    renderCompare();

    const differences = within(await screen.findByRole('region', { name: 'Differences' }));
    await waitFor(() => expect(differences.getByText('Dimensions')).toBeTruthy());
    expect(differences.getByText('1024 × 1024')).toBeTruthy();
    expect(differences.getByText('1536 × 2048')).toBeTruthy();
  });

  it('brings each picture its own provenance and reports what separates them', async () => {
    vi.mocked(api.listGenerationsForAsset).mockImplementation((_projectId, assetId) =>
      Promise.resolve(
        page([
          assetId === 'ast_1'
            ? generation()
            : generation({
                id: 'gen_2',
                prompt: 'A rugged salvage diver, cracked helmet',
                seed: '9876',
              }),
        ]),
      ),
    );

    renderCompare();

    const differences = within(await screen.findByRole('region', { name: 'Differences' }));
    await waitFor(() => expect(differences.getByText('Prompt')).toBeTruthy());
    expect(differences.getByText('Seed')).toBeTruthy();
    expect(differences.getByText('1234')).toBeTruthy();
    expect(differences.getByText('9876')).toBeTruthy();
  });

  it('says an uploaded picture was uploaded', async () => {
    renderCompare();

    const a = within(await screen.findByRole('region', { name: 'Side A' }));
    await waitFor(() => expect(a.getByText('Uploaded')).toBeTruthy());
  });

  it('compares whichever two pictures are picked', async () => {
    const third = asset({ id: 'ast_3', filename: 'kael-helmet.png', byteSize: 5000 });
    renderCompare([portrait, variant, third]);

    fireEvent.change(await screen.findByLabelText('B'), { target: { value: 'ast_3' } });

    const b = within(screen.getByRole('region', { name: 'Side B' }));
    await waitFor(() => expect(b.getByRole('img', { name: 'kael-helmet.png' })).toBeTruthy());
  });

  /** An asset has no history to restore and no promotion to make. */
  it('offers no action that the data behind it does not support', async () => {
    renderCompare();

    await screen.findByRole('region', { name: 'Side A' });
    expect(screen.queryByRole('button', { name: /restore/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /choose/i })).toBeNull();
  });

  it('marks a picture that has been archived', async () => {
    renderCompare([portrait, asset({ id: 'ast_2', filename: 'old.png', status: 'archived' })]);

    const b = within(await screen.findByRole('region', { name: 'Side B' }));
    expect(b.getByText('Archived')).toBeTruthy();
    const differences = within(screen.getByRole('region', { name: 'Differences' }));
    expect(differences.getByText('Status')).toBeTruthy();
  });
});
