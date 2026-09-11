// @vitest-environment jsdom
import type { Entity, EntityPage, PrototypeContents, PrototypeVersion } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrototypesWorkspace } from './prototypes-workspace';

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  assetContentUrl: (projectId: string, assetId: string) => `/assets/${projectId}/${assetId}`,
  listEntities: vi.fn(),
  getEntity: vi.fn(),
  archiveEntity: vi.fn(),
  restoreEntity: vi.fn(),
  listPrototypeVersions: vi.fn(),
  getPrototypeVersionContents: vi.fn(),
  comparePrototypeVersions: vi.fn(),
  annotatePrototypeVersion: vi.fn(),
  listPlaytests: vi.fn(),
  createPlaytest: vi.fn(),
}));

const api = await import('@/lib/api');

function prototype(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_proto',
    projectId: 'prj_1',
    type: 'prototype',
    name: 'Deep Dive',
    description: 'A salvage-diving vertical slice.',
    status: 'active',
    tags: [],
    data: {},
    currentVersionId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    archivedAt: null,
    ...overrides,
  };
}

function page(items: Entity[]): EntityPage {
  return { items, total: items.length };
}

function version(overrides: Partial<PrototypeVersion> = {}): PrototypeVersion {
  return {
    id: 'pv_1',
    projectId: 'prj_1',
    prototypeId: 'ent_proto',
    versionNumber: 1,
    name: null,
    status: 'playable',
    notes: null,
    buildAssetId: null,
    members: [],
    createdBy: null,
    createdAt: new Date('2026-01-10'),
    updatedAt: new Date('2026-01-10'),
    ...overrides,
  };
}

function contents(v: PrototypeVersion): PrototypeContents {
  return { prototype: prototype(), version: v, entityVersions: [], buildAsset: null };
}

function browser() {
  return within(screen.getByRole('region', { name: 'Prototypes' }));
}

function detail() {
  return screen.findByRole('region', { name: 'Prototype detail' });
}

function renderWorkspace(projectId = 'prj_1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PrototypesWorkspace projectId={projectId} />
    </QueryClientProvider>,
  );
}

describe('Prototypes workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listEntities).mockResolvedValue(page([]));
    vi.mocked(api.listPrototypeVersions).mockResolvedValue({ items: [version()], total: 1 });
    vi.mocked(api.getPrototypeVersionContents).mockResolvedValue(contents(version()));
    vi.mocked(api.listPlaytests).mockResolvedValue({ items: [], total: 0 });
  });

  afterEach(cleanup);

  it('invites nobody to create a prototype from an empty project — prototypes come from promotion', async () => {
    renderWorkspace();

    await screen.findByText('No prototypes yet');
    expect(browser().queryByRole('button', { name: /new prototype/i })).toBeNull();
  });

  it('browses prototypes and opens the one selected', async () => {
    vi.mocked(api.listEntities).mockResolvedValue(page([prototype()]));
    vi.mocked(api.getEntity).mockResolvedValue(prototype());

    renderWorkspace();
    fireEvent.click(await screen.findByText('Deep Dive'));

    const surface = within(await detail());
    expect(surface.getByRole('heading', { name: 'Deep Dive' })).toBeDefined();
    expect(await surface.findByRole('tab', { name: /^v1/ })).toBeDefined();
  });

  it("scopes every read for the selected prototype to this workspace's own project", async () => {
    vi.mocked(api.listEntities).mockResolvedValue(page([prototype()]));
    vi.mocked(api.getEntity).mockResolvedValue(prototype());

    renderWorkspace('prj_1');
    fireEvent.click(await screen.findByText('Deep Dive'));
    await detail();

    await waitFor(() => expect(api.getEntity).toHaveBeenCalledWith('prj_1', 'ent_proto'));
    await waitFor(() =>
      expect(api.listPrototypeVersions).toHaveBeenCalledWith(
        'prj_1',
        'ent_proto',
        expect.anything(),
      ),
    );

    for (const call of vi.mocked(api.getEntity).mock.calls) expect(call[0]).toBe('prj_1');
    for (const call of vi.mocked(api.listPrototypeVersions).mock.calls)
      expect(call[0]).toBe('prj_1');
  });

  it('fails a cross-project id closed — the same "could not load" state as any other failure, never a distinct message', async () => {
    vi.mocked(api.listEntities).mockResolvedValue(page([prototype({ id: 'ent_other' })]));
    vi.mocked(api.getEntity).mockRejectedValue(new api.ApiRequestError('Not found', 404));

    renderWorkspace();
    fireEvent.click(await screen.findByText('Deep Dive'));

    expect(await screen.findByText("Couldn't load this prototype")).toBeDefined();
    expect(screen.getByText('Not found')).toBeDefined();
  });
});
