// @vitest-environment jsdom
import type { Generation } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GenerationQueuePanel } from './generation-queue-panel';

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  listGenerations: vi.fn(),
  cancelGeneration: vi.fn(),
}));

const api = await import('@/lib/api');

function generation(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'gen_1',
    projectId: 'prj_1',
    capability: 'image.generate',
    provider: null,
    model: null,
    prompt: 'a drowned cathedral',
    parameters: {},
    status: 'running',
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
    createdAt: new Date('2026-09-01T10:00:00Z'),
    startedAt: new Date('2026-09-01T10:00:05Z'),
    completedAt: null,
    createdBy: null,
    ...overrides,
  };
}

function renderPanel(projectId = 'prj_1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <GenerationQueuePanel projectId={projectId} />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the queue panel', () => {
  it('is empty-stated, not hidden, when the project has nothing in flight', async () => {
    vi.mocked(api.listGenerations).mockResolvedValue({ items: [], total: 0 });

    renderPanel();

    expect(await screen.findByText('Generation Queue')).toBeTruthy();
    expect(await screen.findByText('Nothing generating')).toBeTruthy();
  });

  it('shows a queued generation with its capability and how long it has been queued', async () => {
    vi.mocked(api.listGenerations).mockResolvedValue({
      items: [
        generation({
          status: 'queued',
          startedAt: null,
          createdAt: new Date(Date.now() - 12 * 60 * 1000),
        }),
      ],
      total: 1,
    });

    renderPanel();

    expect(await screen.findByText('Image · Generate')).toBeTruthy();
    expect(await screen.findByText('Queued')).toBeTruthy();
    expect(await screen.findByText('12m')).toBeTruthy();
  });

  it('shows a running generation as generating, with elapsed time since it started', async () => {
    vi.mocked(api.listGenerations).mockResolvedValue({
      items: [generation({ status: 'running', startedAt: new Date(Date.now() - 2 * 60 * 1000) })],
      total: 1,
    });

    renderPanel();

    expect(await screen.findByText('Generating…')).toBeTruthy();
    expect(await screen.findByText('2m')).toBeTruthy();
  });

  it('shows a failed generation with its reason, and dismisses it on request', async () => {
    vi.mocked(api.listGenerations).mockResolvedValue({
      items: [
        generation({
          status: 'failed',
          failure: { code: 'content_filtered', message: 'The model declined', details: {} },
        }),
      ],
      total: 1,
    });

    renderPanel();

    expect(await screen.findByText('The model declined (content_filtered)')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(screen.getByText('Nothing generating')).toBeTruthy());
  });

  it('cancels a running generation', async () => {
    vi.mocked(api.listGenerations).mockResolvedValue({
      items: [generation({ id: 'gen_running', status: 'running' })],
      total: 1,
    });
    vi.mocked(api.cancelGeneration).mockResolvedValue(
      generation({ id: 'gen_running', status: 'cancelled' }),
    );

    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(api.cancelGeneration).toHaveBeenCalledWith('prj_1', 'gen_running'),
    );
  });

  it('links View All to the generations already surfaced in Search, not a new history view', async () => {
    vi.mocked(api.listGenerations).mockResolvedValue({ items: [], total: 0 });

    renderPanel('prj_1');

    const link = await screen.findByRole('link', { name: 'View All →' });
    expect(link.getAttribute('href')).toBe('/projects/prj_1/search?sourceType=generation');
  });

  it('reads only the project it was given, never another project’s work', async () => {
    vi.mocked(api.listGenerations).mockImplementation(async (projectId: string) => ({
      items: projectId === 'prj_a' ? [generation({ id: 'gen_a', projectId: 'prj_a' })] : [],
      total: projectId === 'prj_a' ? 1 : 0,
    }));

    renderPanel('prj_b');

    await waitFor(() => expect(api.listGenerations).toHaveBeenCalledWith('prj_b', expect.anything()));
    expect(screen.getByText('Nothing generating')).toBeTruthy();
  });
});
