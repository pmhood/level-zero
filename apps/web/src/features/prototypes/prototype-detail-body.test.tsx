// @vitest-environment jsdom
import type {
  Asset,
  Entity,
  EntityVersion,
  Playtest,
  PrototypeContents,
  PrototypeVersion,
  PrototypeVersionComparison,
} from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrototypeDetailBody } from './prototype-detail-body';

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
    description: null,
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

function entityVersion(id: string, versionNumber: number, name: string): EntityVersion {
  return {
    id,
    projectId: 'prj_1',
    entityId: 'ent_diver',
    versionNumber,
    parentVersionId: null,
    branchName: 'main',
    snapshot: { name, description: null, status: 'active', tags: [], data: {} },
    reason: 'manual',
    metadata: {},
    createdBy: null,
    createdAt: new Date('2026-01-15'),
  };
}

function buildAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset_build',
    projectId: 'prj_1',
    kind: 'build_artifact',
    filename: 'build.zip',
    mimeType: 'application/zip',
    byteSize: 2048,
    storageKey: 'key',
    checksum: 'abc',
    width: null,
    height: null,
    durationSeconds: null,
    variant: 'source',
    sourceAssetId: null,
    status: 'active',
    createdAt: new Date('2026-02-01'),
    updatedAt: new Date('2026-02-01'),
    archivedAt: null,
    createdBy: null,
    ...overrides,
  };
}

const diverV1 = entityVersion('ver_diver_1', 1, 'Diver (draft)');
const diverV2 = entityVersion('ver_diver_2', 2, 'Diver');

function protoVersion(overrides: Partial<PrototypeVersion> = {}): PrototypeVersion {
  return {
    id: 'pv_1',
    projectId: 'prj_1',
    prototypeId: 'ent_proto',
    versionNumber: 1,
    name: null,
    status: 'draft',
    notes: null,
    buildAssetId: null,
    members: [{ entityId: 'ent_diver', entityVersionId: 'ver_diver_1' }],
    createdBy: null,
    createdAt: new Date('2026-01-10'),
    updatedAt: new Date('2026-01-10'),
    ...overrides,
  };
}

const v1 = protoVersion();
const v2 = protoVersion({
  id: 'pv_2',
  versionNumber: 2,
  status: 'playable',
  buildAssetId: 'asset_build',
  members: [{ entityId: 'ent_diver', entityVersionId: 'ver_diver_2' }],
  createdAt: new Date('2026-02-01'),
  updatedAt: new Date('2026-02-01'),
});

function contentsFor(version: PrototypeVersion): PrototypeContents {
  const pinned = version.id === 'pv_1' ? [diverV1] : [diverV2];
  return {
    prototype: prototype(),
    version,
    entityVersions: pinned,
    buildAsset: version.buildAssetId ? buildAsset() : null,
  };
}

function comparison(): PrototypeVersionComparison {
  return {
    from: v1,
    to: v2,
    added: [],
    removed: [],
    changed: [{ entityId: 'ent_diver', from: 'ver_diver_1', to: 'ver_diver_2' }],
  };
}

function playtestsPage(items: Playtest[] = []) {
  return { items, total: items.length };
}

function playtest(overrides: Partial<Playtest> = {}): Playtest {
  return {
    id: 'pt_1',
    projectId: 'prj_1',
    prototypeVersionId: 'pv_2',
    name: 'First session',
    goal: null,
    status: 'planned',
    summary: null,
    tags: [],
    createdBy: null,
    createdAt: new Date('2026-02-05'),
    updatedAt: new Date('2026-02-05'),
    ...overrides,
  };
}

function renderBody(entity: Entity = prototype()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PrototypeDetailBody projectId="prj_1" entity={entity} />
    </QueryClientProvider>,
  );
}

describe('PrototypeDetailBody', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listPrototypeVersions).mockResolvedValue({ items: [v2, v1], total: 2 });
    vi.mocked(api.getPrototypeVersionContents).mockImplementation(
      (_projectId: string, _prototypeId: string, versionId: string) =>
        Promise.resolve(contentsFor(versionId === 'pv_1' ? v1 : v2)),
    );
    vi.mocked(api.comparePrototypeVersions).mockResolvedValue(comparison());
    vi.mocked(api.listPlaytests).mockResolvedValue(playtestsPage());
  });

  afterEach(cleanup);

  it('opens on the latest version and switches versions on demand, each rendering its own exact pins', async () => {
    renderBody();

    // Defaults to v2, the latest — its own historical pin, "Diver" at v2.
    expect(await screen.findByText('Diver')).toBeDefined();
    expect(screen.getByRole('tab', { name: /^v2/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('link', { name: 'Open build' })).toBeDefined();

    // Switching to v1 shows v1's own pin, not v2's — a different entity
    // version entirely, resolved from v1's own captured members.
    fireEvent.click(screen.getByRole('tab', { name: /^v1/ }));

    expect(await screen.findByText('Diver (draft)')).toBeDefined();
    expect(screen.queryByText('Diver')).toBeNull();

    // v1 has no build artifact: an honest empty state, not a broken player.
    expect(screen.getByText('No playable build for this version')).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Open build' })).toBeNull();
  });

  it('lists playtests scoped to the selected version and starts a new one', async () => {
    vi.mocked(api.listPlaytests).mockImplementation((_projectId: string, params) =>
      Promise.resolve(playtestsPage(params?.prototypeVersionId === 'pv_2' ? [playtest()] : [])),
    );
    vi.mocked(api.createPlaytest).mockResolvedValue(
      playtest({ id: 'pt_2', name: 'Second session' }),
    );

    renderBody();
    await screen.findByText('Diver');

    fireEvent.click(screen.getByRole('tab', { name: 'Playtests' }));

    expect(await screen.findByText('First session')).toBeDefined();
    await waitFor(() =>
      expect(api.listPlaytests).toHaveBeenCalledWith(
        'prj_1',
        expect.objectContaining({ prototypeVersionId: 'pv_2' }),
      ),
    );

    fireEvent.change(screen.getByLabelText('Start a playtest of v2'), {
      target: { value: 'Second session' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start playtest' }));

    await waitFor(() =>
      expect(api.createPlaytest).toHaveBeenCalledWith('prj_1', {
        prototypeVersionId: 'pv_2',
        name: 'Second session',
        goal: null,
      }),
    );
  });

  it('compares versions using the shared compare primitives, showing the pin that moved', async () => {
    renderBody();
    await screen.findByText('Diver');

    fireEvent.click(screen.getByRole('tab', { name: 'Compare' }));

    const differences = await screen.findByRole('region', { name: 'Differences' });
    // The one entity whose pin changed between v1 and v2 shows up as a
    // difference row, named by its current side and reading "v1 → v2" —
    // reusing `prototypeVersionDifferences` and `CompareView` rather than a
    // bespoke rendering. `findByText` (not `getByText`) because the pinned
    // entity versions each side names are a second, independent fetch that
    // can resolve after the comparison itself does.
    expect(await within(differences).findByText('Diver')).toBeDefined();
    expect(await within(differences).findByText('v1')).toBeDefined();
    expect(await within(differences).findByText('v2')).toBeDefined();
  });
});
