// @vitest-environment jsdom
import type { Generation } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGenerationQueue } from './use-generation';

vi.mock('@/lib/api', () => ({
  listGenerations: vi.fn(),
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

function renderQueue(projectId: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { queryClient, ...renderHook(() => useGenerationQueue(projectId), { wrapper }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('useGenerationQueue', () => {
  it('reads only what is queued, running, or freshly failed', async () => {
    vi.mocked(api.listGenerations).mockResolvedValue({ items: [generation()], total: 1 });

    const { result } = renderQueue('prj_1');

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(api.listGenerations).toHaveBeenCalledWith('prj_1', {
      status: ['queued', 'running', 'failed'],
      limit: 20,
    });
  });

  it('reads only the project it was given, never another project’s work', async () => {
    vi.mocked(api.listGenerations).mockImplementation(async (projectId: string) => ({
      items: projectId === 'prj_a' ? [generation({ projectId: 'prj_a' })] : [],
      total: projectId === 'prj_a' ? 1 : 0,
    }));

    const a = renderQueue('prj_a');
    const b = renderQueue('prj_b');

    await waitFor(() => expect(a.result.current.data).toHaveLength(1));
    await waitFor(() => expect(b.result.current.data).toHaveLength(0));
  });

  /**
   * `refetchInterval` (wired via `queuePollInterval`, unit-tested on its own
   * in `generation.test.ts` for the on/off decision) is what actually calls
   * this on a timer in the browser; triggering the same `refetch()` it would
   * call proves what happens to the queue's *data* on a poll tick without a
   * real or faked multi-second wait standing in for one.
   */
  it('replaces the queue with whatever a poll tick reads back, e.g. a generation that finished between polls', async () => {
    vi.mocked(api.listGenerations)
      .mockResolvedValueOnce({
        items: [generation({ id: 'gen_running', status: 'running' })],
        total: 1,
      })
      .mockResolvedValueOnce({ items: [], total: 0 });

    const { result } = renderQueue('prj_1');
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.data).toHaveLength(0));
    expect(api.listGenerations).toHaveBeenCalledTimes(2);
  });

  it('invalidates the asset library once a generation leaves the active set, so results appear without a reload', async () => {
    vi.mocked(api.listGenerations)
      .mockResolvedValueOnce({
        items: [generation({ id: 'gen_running', status: 'running' })],
        total: 1,
      })
      .mockResolvedValueOnce({ items: [], total: 0 });

    const { result, queryClient } = renderQueue('prj_1');
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(invalidateSpy).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['projects', 'prj_1', 'assets'] }),
      ),
    );
  });

  it('does not invalidate the library while the same generation is still running', async () => {
    vi.mocked(api.listGenerations).mockResolvedValue({
      items: [generation({ id: 'gen_running', status: 'running' })],
      total: 1,
    });

    const { result, queryClient } = renderQueue('prj_1');
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(result.current.data).toHaveLength(1));

    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(api.listGenerations).toHaveBeenCalledTimes(2));

    expect(invalidateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['projects', 'prj_1', 'assets'] }),
    );
  });
});
