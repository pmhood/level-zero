// @vitest-environment jsdom
import type { Asset, Entity, EntityNeighborhood, NeighborEdge } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CharacterVisuals } from './character-visuals';

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  assetContentUrl: (projectId: string, assetId: string) => `/assets/${projectId}/${assetId}`,
  listEntities: vi.fn(),
  listAssets: vi.fn(),
  createEntity: vi.fn(),
  getEntityNeighborhood: vi.fn(),
  createRelationship: vi.fn(),
  deleteRelationship: vi.fn(),
  listGenerationsForAsset: vi.fn(),
}));

const api = await import('@/lib/api');

function character(overrides: Partial<Entity> = {}): Entity {
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

function reference(assetId: string | null, overrides: Partial<Entity> = {}): Entity {
  return character({
    id: 'ent_ref',
    type: 'asset_reference',
    name: 'kael-portrait.png',
    data: assetId === null ? {} : { assetId },
    ...overrides,
  });
}

function edge(target: Entity, relationshipId = 'rel_1'): NeighborEdge {
  return {
    relationship: {
      id: relationshipId,
      projectId: 'prj_1',
      sourceEntityId: 'ent_kael',
      targetEntityId: target.id,
      relation: 'references',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    direction: 'outgoing',
    entity: target,
  };
}

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'ast_portrait',
    projectId: 'prj_1',
    kind: 'image',
    filename: 'kael-portrait.png',
    mimeType: 'image/png',
    byteSize: 1024,
    storageKey: 'projects/prj_1/kael-portrait.png',
    checksum: 'abc',
    width: 800,
    height: 1000,
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

function neighborhood(outgoing: NeighborEdge[]): EntityNeighborhood {
  return { entity: character(), outgoing, incoming: [] };
}

function renderVisuals(subject: Entity = character()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CharacterVisuals projectId="prj_1" character={subject} />
    </QueryClientProvider>,
  );
}

describe('Character visuals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(neighborhood([]));
    vi.mocked(api.listAssets).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(api.listEntities).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(api.listGenerationsForAsset).mockResolvedValue({ items: [], total: 0 });
  });

  afterEach(cleanup);

  it('waits for both the edges and the files before drawing anything', () => {
    vi.mocked(api.getEntityNeighborhood).mockReturnValue(new Promise(() => {}));

    renderVisuals();

    expect(screen.getByText('Loading visuals…')).toBeDefined();
  });

  it('says what went wrong when the files cannot be listed', async () => {
    vi.mocked(api.listAssets).mockRejectedValue(new Error('Storage unavailable'));

    renderVisuals();

    await screen.findByText('Storage unavailable');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
  });

  it('invites a first visual when nothing is linked', async () => {
    renderVisuals();

    await screen.findByText('No visuals yet');
  });

  it('leaves room for the generative actions without pretending they run', async () => {
    renderVisuals();
    await screen.findByText('No visuals yet');

    const generate = screen.getByRole('button', { name: 'Generate Portrait' });
    expect(generate).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: '3D Concept' })).toBeDefined();
  });

  it('offers a comparison only once there are two pictures to compare', async () => {
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood([edge(reference('ast_portrait'))]),
    );
    vi.mocked(api.listAssets).mockResolvedValue({ items: [asset()], total: 1 });

    renderVisuals();

    await screen.findByRole('img', { name: 'kael-portrait.png' });
    expect(screen.queryByRole('button', { name: 'Compare two images' })).toBeNull();
  });

  it('compares two of the character’s pictures side by side', async () => {
    const outfit = asset({ id: 'ast_outfit', filename: 'kael-outfit.png' });
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood([
        edge(reference('ast_portrait')),
        edge(reference('ast_outfit', { id: 'ent_ref_2', name: 'kael-outfit.png' }), 'rel_2'),
      ]),
    );
    vi.mocked(api.listAssets).mockResolvedValue({ items: [asset(), outfit], total: 2 });

    renderVisuals();

    fireEvent.click(await screen.findByRole('button', { name: 'Compare two images' }));

    await screen.findByRole('region', { name: 'Side A' });
    expect(screen.getByRole('region', { name: 'Differences' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Back to visuals' }));
    await screen.findByRole('button', { name: 'Compare two images' });
  });

  it('shows a linked asset as the picture it is', async () => {
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood([edge(reference('ast_portrait'))]),
    );
    vi.mocked(api.listAssets).mockResolvedValue({ items: [asset()], total: 1 });

    renderVisuals();

    const image = await screen.findByRole('img', { name: 'kael-portrait.png' });
    expect(image.getAttribute('src')).toBe('/assets/prj_1/ast_portrait');
  });

  it('marks a reference whose asset has gone rather than hiding the broken link', async () => {
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood([edge(reference('ast_deleted'))]),
    );
    vi.mocked(api.listAssets).mockResolvedValue({ items: [], total: 0 });

    renderVisuals();

    await screen.findByText('Missing asset');
    expect(screen.getByText('Image unavailable')).toBeDefined();
    expect(screen.getByText('kael-portrait.png')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Unlink kael-portrait.png' })).toBeDefined();
  });

  it('marks a reference that names no asset at all', async () => {
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(neighborhood([edge(reference(null))]));

    renderVisuals();

    await screen.findByText('Missing asset');
  });

  it('reuses the asset reference an asset already has instead of making a second', async () => {
    const existing = reference('ast_portrait', { id: 'ent_existing' });
    vi.mocked(api.listAssets).mockResolvedValue({ items: [asset()], total: 1 });
    vi.mocked(api.listEntities).mockResolvedValue({ items: [existing], total: 1 });
    vi.mocked(api.createRelationship).mockResolvedValue(edge(existing).relationship);

    renderVisuals();
    await screen.findByText('No visuals yet');

    fireEvent.change(screen.getByRole('combobox', { name: 'Image to link' }), {
      target: { value: 'ast_portrait' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link image' }));

    await waitFor(() => expect(api.createRelationship).toHaveBeenCalledOnce());
    expect(api.createEntity).not.toHaveBeenCalled();
    expect(vi.mocked(api.createRelationship).mock.calls[0]![2]).toEqual({
      targetEntityId: 'ent_existing',
      relation: 'references',
    });
  });

  it('creates an asset reference for an asset nothing points at yet', async () => {
    vi.mocked(api.listAssets).mockResolvedValue({ items: [asset()], total: 1 });
    vi.mocked(api.createEntity).mockResolvedValue(reference('ast_portrait'));
    vi.mocked(api.createRelationship).mockResolvedValue(
      edge(reference('ast_portrait')).relationship,
    );

    renderVisuals();
    await screen.findByText('No visuals yet');

    fireEvent.change(screen.getByRole('combobox', { name: 'Image to link' }), {
      target: { value: 'ast_portrait' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link image' }));

    await waitFor(() => expect(api.createEntity).toHaveBeenCalledOnce());
    expect(vi.mocked(api.createEntity).mock.calls[0]![1]).toMatchObject({
      type: 'asset_reference',
      data: { assetId: 'ast_portrait' },
    });
  });

  it('unlinks a visual by removing the edge, never the file', async () => {
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood([edge(reference('ast_portrait'))]),
    );
    vi.mocked(api.listAssets).mockResolvedValue({ items: [asset()], total: 1 });
    vi.mocked(api.deleteRelationship).mockResolvedValue(undefined);

    renderVisuals();
    fireEvent.click(await screen.findByRole('button', { name: 'Unlink kael-portrait.png' }));

    await waitFor(() => expect(api.deleteRelationship).toHaveBeenCalledOnce());
    expect(vi.mocked(api.deleteRelationship).mock.calls[0]).toEqual(['prj_1', 'ent_kael', 'rel_1']);
  });

  it('will not change the visuals of an archived character', async () => {
    renderVisuals(character({ status: 'archived', archivedAt: new Date() }));

    await screen.findByText(
      'Restore this character to change its visuals. The links themselves are intact.',
    );
    expect(screen.queryByRole('combobox', { name: 'Image to link' })).toBeNull();
  });
});
