// @vitest-environment jsdom
import type {
  Asset,
  Entity,
  EntityNeighborhood,
  Generation,
  NeighborEdge,
} from '@level-zero/domain';
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
  findOrCreateAssetReference: vi.fn(),
  getEntityNeighborhood: vi.fn(),
  createRelationship: vi.fn(),
  deleteRelationship: vi.fn(),
  listGenerationsForAsset: vi.fn(),
  listGenerations: vi.fn(),
  createGeneration: vi.fn(),
  getGeneration: vi.fn(),
  getGenerationProvenance: vi.fn(),
  cancelGeneration: vi.fn(),
  getAsset: vi.fn(),
  listJobs: vi.fn(),
  jobStreamUrl: (projectId: string) => `/jobs/${projectId}/stream`,
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
    pipelineStage: 'concept',
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    createdBy: null,
    ...overrides,
  };
}

function queuedGeneration(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'gen_1',
    projectId: 'prj_1',
    capability: 'image.generate',
    provider: null,
    model: null,
    prompt: 'a portrait',
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
    attempts: [],
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
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
    vi.mocked(api.listGenerations).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(api.listJobs).mockResolvedValue({ items: [], total: 0 });
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

  it('runs a studio preset through the shared generation surface', async () => {
    vi.mocked(api.createGeneration).mockResolvedValue(
      queuedGeneration({ capability: 'image.generate' }),
    );
    renderVisuals();
    await screen.findByText('No visuals yet');

    fireEvent.click(screen.getByRole('button', { name: 'Generate Portrait' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() =>
      expect(api.createGeneration).toHaveBeenCalledWith('prj_1', {
        capability: 'image.generate',
        prompt: 'Character portrait: head and shoulders, neutral key light, concept-art finish.',
        // The character goes in as context, so the model reads who it is drawing.
        context: { selectedEntityIds: ['ent_kael'] },
      }),
    );
  });

  it('asks for a source image before it will run a variation preset', async () => {
    renderVisuals();
    await screen.findByText('No visuals yet');

    fireEvent.click(screen.getByRole('button', { name: 'Outfit Variants' }));

    expect(screen.getByRole('button', { name: 'Variations' })).toHaveProperty('disabled', true);
    expect(screen.getByText(/no images yet/)).toBeTruthy();
    expect(api.createGeneration).not.toHaveBeenCalled();
  });

  it('links a generated result through a shared asset reference, never a copy', async () => {
    const finished = queuedGeneration({ status: 'complete', outputAssetIds: ['ast_new'] });
    const result = asset({ id: 'ast_new', filename: 'generated.svg' });
    vi.mocked(api.listGenerations).mockResolvedValue({ items: [finished], total: 1 });
    vi.mocked(api.getGeneration).mockResolvedValue(finished);
    vi.mocked(api.getAsset).mockResolvedValue(result);
    vi.mocked(api.findOrCreateAssetReference).mockResolvedValue(reference('ast_new'));
    vi.mocked(api.createRelationship).mockResolvedValue(edge(reference('ast_new')).relationship);

    renderVisuals();

    fireEvent.click(await screen.findByRole('button', { name: 'Link to Kael Voss' }));

    await waitFor(() =>
      expect(api.findOrCreateAssetReference).toHaveBeenCalledWith('prj_1', {
        assetId: 'ast_new',
        name: 'generated.svg',
      }),
    );
    expect(api.createRelationship).toHaveBeenCalledWith('prj_1', 'ent_kael', {
      targetEntityId: 'ent_ref',
      relation: 'references',
    });
  });

  it('offers no generator for an archived character', async () => {
    renderVisuals(character({ status: 'archived' }));
    await screen.findByText('No visuals yet');

    expect(screen.queryByRole('button', { name: 'Generate Portrait' })).toBeNull();
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
    vi.mocked(api.findOrCreateAssetReference).mockResolvedValue(existing);
    vi.mocked(api.createRelationship).mockResolvedValue(edge(existing).relationship);

    renderVisuals();
    await screen.findByText('No visuals yet');

    fireEvent.change(screen.getByRole('combobox', { name: 'Image to link' }), {
      target: { value: 'ast_portrait' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link image' }));

    await waitFor(() => expect(api.createRelationship).toHaveBeenCalledOnce());
    expect(vi.mocked(api.createRelationship).mock.calls[0]![2]).toEqual({
      targetEntityId: 'ent_existing',
      relation: 'references',
    });
  });

  it('creates an asset reference for an asset nothing points at yet', async () => {
    vi.mocked(api.listAssets).mockResolvedValue({ items: [asset()], total: 1 });
    vi.mocked(api.findOrCreateAssetReference).mockResolvedValue(reference('ast_portrait'));
    vi.mocked(api.createRelationship).mockResolvedValue(
      edge(reference('ast_portrait')).relationship,
    );

    renderVisuals();
    await screen.findByText('No visuals yet');

    fireEvent.change(screen.getByRole('combobox', { name: 'Image to link' }), {
      target: { value: 'ast_portrait' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link image' }));

    await waitFor(() => expect(api.findOrCreateAssetReference).toHaveBeenCalledOnce());
    expect(api.findOrCreateAssetReference).toHaveBeenCalledWith('prj_1', {
      assetId: 'ast_portrait',
      name: 'kael-portrait.png',
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
