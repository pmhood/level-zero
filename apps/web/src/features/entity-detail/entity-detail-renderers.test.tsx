// @vitest-environment jsdom
import {
  ENTITY_TYPES,
  type Entity,
  type EntityHistory,
  type EntityNeighborhood,
  type EntityType,
  type PrototypeVersion,
} from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityDetailPage } from './entity-detail-page';
import { ENTITY_DETAIL_BODIES } from './entity-detail-renderers';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

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
  getEntity: vi.fn(),
  getEntityNeighborhood: vi.fn(),
  getEntityHistory: vi.fn(),
  restoreEntity: vi.fn(),
  listPrototypeVersions: vi.fn(),
  getPrototypeVersionContents: vi.fn(),
  comparePrototypeVersions: vi.fn(),
  annotatePrototypeVersion: vi.fn(),
  listPlaytests: vi.fn(),
  createPlaytest: vi.fn(),
}));

const api = await import('@/lib/api');

function entity(type: EntityType, overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_1',
    projectId: 'prj_1',
    type,
    name: 'Something',
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

function neighborhood(type: EntityType): EntityNeighborhood {
  return { entity: entity(type), outgoing: [], incoming: [] };
}

function history(): EntityHistory {
  return { entityId: 'ent_1', versions: [], currentVersionId: null, branches: [], total: 0 };
}

function renderEntity(type: EntityType) {
  vi.mocked(api.getEntity).mockResolvedValue(entity(type));
  vi.mocked(api.getEntityNeighborhood).mockResolvedValue(neighborhood(type));
  vi.mocked(api.getEntityHistory).mockResolvedValue(history());

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <EntityDetailPage projectId="prj_1" entityId="ent_1" />
    </QueryClientProvider>,
  );
}

function protoVersion(overrides: Partial<PrototypeVersion> = {}): PrototypeVersion {
  return {
    id: 'pv_1',
    projectId: 'prj_1',
    prototypeId: 'ent_1',
    versionNumber: 1,
    name: null,
    status: 'draft',
    notes: null,
    buildAssetId: null,
    members: [],
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// The twelve types docs/decisions/canonical-entity-routes.md §7 gives a
// bespoke body; every other ENTITY_TYPES member takes the fallback.
// `prototype` joined this list once issue #64 built its own tabbed surface —
// §12's own follow-up note said this would be "one line in the map" once
// that feature had a detail surface worth showing.
const BESPOKE_TYPES: EntityType[] = [
  'character',
  'mechanic',
  'system',
  'region',
  'location',
  'faction',
  'culture',
  'technology',
  'event',
  'hazard',
  'lore',
  'prototype',
];

describe('ENTITY_DETAIL_BODIES', () => {
  it('names exactly the twelve types §7 (as amended by issue #64) gives a bespoke body', () => {
    expect(Object.keys(ENTITY_DETAIL_BODIES).sort()).toEqual([...BESPOKE_TYPES].sort());
  });

  it('leaves the other seven types to the fallback', () => {
    const fallbackTypes = ENTITY_TYPES.filter((type) => !BESPOKE_TYPES.includes(type));
    expect(fallbackTypes).toHaveLength(7);

    for (const type of fallbackTypes) {
      expect(ENTITY_DETAIL_BODIES[type]).toBeUndefined();
    }
  });
});

describe('the canonical route renders the real tabbed surface for a bespoke type', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('character opens onto CharacterDetailBody', async () => {
    renderEntity('character');

    expect(await screen.findByRole('tab', { name: 'Inventory' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Relationships' })).toBeDefined();
  });

  it('mechanic opens onto MechanicDetailBody', async () => {
    renderEntity('mechanic');

    expect(await screen.findByRole('tab', { name: 'Rules & I/O' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Rationale' })).toBeDefined();
  });

  it('system opens onto the same MechanicDetailBody as mechanic', async () => {
    renderEntity('system');

    expect(await screen.findByRole('tab', { name: 'Tuning' })).toBeDefined();
  });

  it('location opens onto WorldDetailBody', async () => {
    renderEntity('location');

    expect(await screen.findByRole('tab', { name: 'Canon' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Lore' })).toBeDefined();
  });

  it('faction, another world type, opens onto the same WorldDetailBody', async () => {
    renderEntity('faction');

    expect(await screen.findByRole('tab', { name: 'Canon' })).toBeDefined();
  });

  it('prototype opens onto PrototypeDetailBody', async () => {
    const version = protoVersion();
    vi.mocked(api.listPrototypeVersions).mockResolvedValue({ items: [version], total: 1 });
    vi.mocked(api.getPrototypeVersionContents).mockResolvedValue({
      prototype: entity('prototype'),
      version,
      entityVersions: [],
      buildAsset: null,
    });
    vi.mocked(api.listPlaytests).mockResolvedValue({ items: [], total: 0 });

    renderEntity('prototype');

    expect(await screen.findByRole('tab', { name: 'Playtests' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Compare' })).toBeDefined();
  });
});

describe('the canonical route still renders the fallback for the eight remaining types', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('idea has no owning tabbed surface, so it gets the fallback', async () => {
    renderEntity('idea');

    expect(await screen.findByText('No description yet.')).toBeDefined();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('document, moodboard and build (no bespoke body yet) also get the fallback', async () => {
    for (const type of ['document', 'moodboard', 'build'] as const) {
      const { unmount } = renderEntity(type);

      expect(await screen.findByText('No description yet.')).toBeDefined();
      expect(screen.queryByRole('tablist')).toBeNull();
      unmount();
    }
  });
});
