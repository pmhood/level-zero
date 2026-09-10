// @vitest-environment jsdom
import type { Asset, Entity, Generation, Job } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GenerationPanel } from './generation-panel';

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  assetContentUrl: (projectId: string, assetId: string) => `/assets/${projectId}/${assetId}`,
  createGeneration: vi.fn(),
  listGenerations: vi.fn(),
  getGeneration: vi.fn(),
  getGenerationProvenance: vi.fn(),
  cancelGeneration: vi.fn(),
  getAsset: vi.fn(),
  listJobs: vi.fn(),
  jobStreamUrl: (projectId: string) => `/jobs/${projectId}/stream`,
}));

const api = await import('@/lib/api');

/**
 * A stand-in for the browser's `EventSource`.
 *
 * jsdom has none, and the stream is the mechanism the panel gets its progress
 * through — so the tests install one and push the events the API would relay,
 * rather than exercising a fallback that production never uses.
 */
class StubEventSource {
  static instances: StubEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    StubEventSource.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  static emit(job: Job): void {
    for (const instance of StubEventSource.instances) {
      instance.onmessage?.({ data: JSON.stringify(job) });
    }
  }
}

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_kael',
    projectId: 'prj_1',
    type: 'character',
    name: 'Kael Voss',
    description: null,
    status: 'active',
    tags: [],
    data: {},
    currentVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    ...overrides,
  };
}

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'ast_source',
    projectId: 'prj_1',
    kind: 'image',
    filename: 'trench.png',
    mimeType: 'image/png',
    byteSize: 2048,
    storageKey: 'prj_1/trench.png',
    checksum: 'abc',
    width: 1024,
    height: 1024,
    durationSeconds: null,
    variant: 'source',
    sourceAssetId: null,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
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
    provider: 'local-image',
    model: 'local-plate-1',
    prompt: 'a drowned cathedral',
    parameters: {},
    status: 'queued',
    inputEntityIds: [],
    inputAssetIds: [],
    contextEntityIds: [],
    resolvedContext: null,
    outputAssetIds: [],
    parentGenerationId: null,
    seed: null,
    providerRequestId: null,
    failure: null,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    createdBy: null,
    ...overrides,
  };
}

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job_1',
    projectId: 'prj_1',
    kind: 'generation',
    targetId: 'gen_1',
    status: 'queued',
    progress: { completed: 0, total: 3, step: null },
    attempt: 1,
    maxAttempts: 3,
    failure: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

function renderPanel(props: Partial<Parameters<typeof GenerationPanel>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <GenerationPanel projectId="prj_1" {...props} />
    </QueryClientProvider>,
  );
}

function typePrompt(text: string): void {
  fireEvent.change(screen.getByLabelText(/Describe/), { target: { value: text } });
}

beforeEach(() => {
  vi.clearAllMocks();
  StubEventSource.instances = [];
  vi.stubGlobal('EventSource', StubEventSource);
  vi.mocked(api.listGenerations).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(api.listJobs).mockResolvedValue({ items: [], total: 0 });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('starting a generation', () => {
  it('records the ask and returns, rather than holding the surface open for a provider', async () => {
    vi.mocked(api.createGeneration).mockResolvedValue(generation());
    vi.mocked(api.getGeneration).mockResolvedValue(generation());
    renderPanel();

    typePrompt('a drowned cathedral');
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() =>
      expect(api.createGeneration).toHaveBeenCalledWith('prj_1', {
        capability: 'image.generate',
        prompt: 'a drowned cathedral',
        context: {},
      }),
    );
    // Queued, and the surface says so instead of pretending to be finished.
    expect(await screen.findByText('Queued — 0 of 3 complete')).toBeTruthy();
  });

  it('carries the workspace’s entities as context, and drops one the user removes', async () => {
    vi.mocked(api.createGeneration).mockResolvedValue(generation());
    vi.mocked(api.getGeneration).mockResolvedValue(generation());
    renderPanel({ contextEntities: [entity(), entity({ id: 'ent_maw', name: 'The Maw' })] });

    fireEvent.click(screen.getByRole('button', { name: 'Remove tag The Maw' }));
    typePrompt('a diver');
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() =>
      expect(api.createGeneration).toHaveBeenCalledWith(
        'prj_1',
        expect.objectContaining({ context: { selectedEntityIds: ['ent_kael'] } }),
      ),
    );
  });

  it('will not send a request with nothing asked for', async () => {
    renderPanel();

    await waitFor(() => expect(api.listGenerations).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Generate' })).toHaveProperty('disabled', true);
  });
});

describe('editing and varying an existing asset', () => {
  it('sends the ticked reference as the image to work from', async () => {
    vi.mocked(api.createGeneration).mockResolvedValue(generation({ capability: 'image.edit' }));
    vi.mocked(api.getGeneration).mockResolvedValue(generation({ capability: 'image.edit' }));
    renderPanel({ referenceAssets: [asset()] });

    fireEvent.click(screen.getByRole('tab', { name: 'Edit' }));
    typePrompt('warmer light');
    fireEvent.click(screen.getByRole('checkbox', { name: 'trench.png' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    await waitFor(() =>
      expect(api.createGeneration).toHaveBeenCalledWith('prj_1', {
        capability: 'image.edit',
        prompt: 'warmer light',
        context: { assetIds: ['ast_source'] },
      }),
    );
  });

  it('refuses an edit until an image is chosen to edit', async () => {
    renderPanel({ referenceAssets: [asset()] });

    fireEvent.click(screen.getByRole('tab', { name: 'Edit' }));
    typePrompt('warmer light');

    expect(screen.getByRole('button', { name: 'Edit' })).toHaveProperty('disabled', true);
    expect(api.createGeneration).not.toHaveBeenCalled();
  });

  it('explores variations from a result as a new generation with the result as its parent', async () => {
    const complete = generation({ status: 'complete', outputAssetIds: ['ast_out'] });
    vi.mocked(api.listGenerations).mockResolvedValue({ items: [complete], total: 1 });
    vi.mocked(api.getGeneration).mockResolvedValue(complete);
    vi.mocked(api.getAsset).mockResolvedValue(asset({ id: 'ast_out', filename: 'result.svg' }));
    vi.mocked(api.createGeneration).mockResolvedValue(
      generation({ id: 'gen_2', capability: 'image.variation' }),
    );
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /Variations/ }));

    await waitFor(() =>
      expect(api.createGeneration).toHaveBeenCalledWith('prj_1', {
        capability: 'image.variation',
        prompt: 'another direction for result.svg',
        // The result goes in as the source, and the generation that made it as
        // the parent — nothing about it is rewritten.
        context: { assetIds: ['ast_out'] },
        parentGenerationId: 'gen_1',
      }),
    );
  });
});

describe('progress and reconnecting', () => {
  it('picks a running generation back up on mount rather than losing it to a reload', async () => {
    const running = generation({ status: 'running' });
    vi.mocked(api.listGenerations).mockResolvedValue({ items: [running], total: 1 });
    vi.mocked(api.getGeneration).mockResolvedValue(running);
    vi.mocked(api.listJobs).mockResolvedValue({
      items: [job({ status: 'running', progress: { completed: 1, total: 3, step: 'Generating' } })],
      total: 1,
    });

    renderPanel();

    expect(await screen.findByText('Generating — 1 of 3 complete')).toBeTruthy();
    expect(api.listJobs).toHaveBeenCalledWith('prj_1', {
      kind: 'generation',
      targetId: 'gen_1',
      limit: 1,
    });
  });

  it('ignores another project’s in-flight text work', async () => {
    vi.mocked(api.listGenerations).mockResolvedValue({
      items: [generation({ capability: 'text.rewrite', status: 'running' })],
      total: 1,
    });

    renderPanel();

    await waitFor(() => expect(api.listGenerations).toHaveBeenCalled());
    expect(api.getGeneration).not.toHaveBeenCalled();
  });

  it('takes progress off the job stream instead of asking again', async () => {
    const running = generation({ status: 'running' });
    vi.mocked(api.listGenerations).mockResolvedValue({ items: [running], total: 1 });
    vi.mocked(api.getGeneration).mockResolvedValue(running);
    vi.mocked(api.listJobs).mockResolvedValue({ items: [job()], total: 1 });
    renderPanel();

    await screen.findByText('Queued — 0 of 3 complete');
    const before = vi.mocked(api.listJobs).mock.calls.length;

    StubEventSource.emit(
      job({ status: 'processing', progress: { completed: 2, total: 3, step: 'Storing result' } }),
    );

    expect(await screen.findByText('Storing result — 2 of 3 complete')).toBeTruthy();
    expect(vi.mocked(api.listJobs).mock.calls).toHaveLength(before);
  });

  it('closes the stream when the surface goes away', async () => {
    renderPanel();
    await waitFor(() => expect(StubEventSource.instances).toHaveLength(1));

    cleanup();

    expect(StubEventSource.instances[0]?.closed).toBe(true);
  });
});

describe('failure', () => {
  it('keeps the diagnostics and shows no result', async () => {
    const failed = generation({
      status: 'failed',
      failure: { code: 'provider_error', message: 'image.edit needs a reference', details: {} },
    });
    vi.mocked(api.listGenerations).mockResolvedValue({ items: [failed], total: 1 });
    vi.mocked(api.getGeneration).mockResolvedValue(failed);

    renderPanel();

    expect(await screen.findByText('image.edit needs a reference (provider_error)')).toBeTruthy();
    expect(screen.getByText(/Nothing was stored/)).toBeTruthy();
    expect(api.getAsset).not.toHaveBeenCalled();
  });
});

describe('using a result', () => {
  it('hands the workspace the asset itself, so it can be linked rather than copied', async () => {
    const complete = generation({ status: 'complete', outputAssetIds: ['ast_out'] });
    const result = asset({ id: 'ast_out', filename: 'result.svg' });
    vi.mocked(api.listGenerations).mockResolvedValue({ items: [complete], total: 1 });
    vi.mocked(api.getGeneration).mockResolvedValue(complete);
    vi.mocked(api.getAsset).mockResolvedValue(result);
    const onUseResult = vi.fn();

    renderPanel({ onUseResult, useResultLabel: 'Add to board' });

    fireEvent.click(await screen.findByRole('button', { name: 'Add to board' }));

    expect(onUseResult).toHaveBeenCalledWith(result);
  });

  it('shows where a result came from when asked, and not before', async () => {
    const complete = generation({
      status: 'complete',
      outputAssetIds: ['ast_out'],
      inputAssetIds: ['ast_source'],
    });
    vi.mocked(api.listGenerations).mockResolvedValue({ items: [complete], total: 1 });
    vi.mocked(api.getGeneration).mockResolvedValue(complete);
    vi.mocked(api.getAsset).mockResolvedValue(asset({ id: 'ast_out', filename: 'result.svg' }));
    vi.mocked(api.getGenerationProvenance).mockResolvedValue({
      generation: complete,
      parent: null,
      inputEntities: [entity()],
      contextEntities: [],
      inputAssets: [asset()],
      outputAssets: [],
    });

    renderPanel();

    const toggle = await screen.findByRole('button', { name: 'Provenance for result.svg' });
    expect(api.getGenerationProvenance).not.toHaveBeenCalled();

    fireEvent.click(toggle);

    expect(await screen.findByText('image.generate · local-plate-1')).toBeTruthy();
    expect(screen.getByText('trench.png')).toBeTruthy();
    expect(screen.getByText('Kael Voss')).toBeTruthy();
  });
});
