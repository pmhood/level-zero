// @vitest-environment jsdom
import type {
  Asset,
  AssetLinkedEntity,
  AssetSelection,
  AssetSelectionContext,
  AssetSummary,
  Entity,
  Generation,
} from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetInspector } from './asset-inspector';

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  assetContentUrl: (projectId: string, assetId: string) =>
    `https://api.test/projects/${projectId}/assets/${assetId}/content`,
  assetDownloadUrl: (projectId: string, assetId: string) =>
    `https://api.test/projects/${projectId}/assets/${assetId}/content?download=true`,
  jobStreamUrl: (projectId: string) => `https://api.test/projects/${projectId}/jobs/stream`,
  listGenerationsForAsset: vi.fn(),
  getGenerationProvenance: vi.fn(),
  listGenerations: vi.fn(),
  getGeneration: vi.fn(),
  listJobs: vi.fn(),
  getAsset: vi.fn(),
  listAssets: vi.fn(),
  archiveAsset: vi.fn(),
  restoreAsset: vi.fn(),
  setAssetPipelineStage: vi.fn(),
  getAssetSelectionSummary: vi.fn(),
  listAssetSelectionsForAsset: vi.fn(),
  listAssetMarks: vi.fn(),
  approveAssetSelection: vi.fn(),
  rejectAssetSelection: vi.fn(),
  markAsset: vi.fn(),
  unmarkAsset: vi.fn(),
  listEntities: vi.fn(),
  collectionsForAsset: vi.fn(),
  addAssetToCollection: vi.fn(),
  removeAssetFromCollection: vi.fn(),
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
    assetId: 'ast_1',
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

function linkedEntity(overrides: Partial<AssetLinkedEntity> = {}): AssetLinkedEntity {
  return { entityId: 'ent_kael', type: 'character', name: 'Kael', ...overrides };
}

function collectionEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'col_props',
    projectId: 'prj_1',
    type: 'asset_collection',
    name: 'Props & Gear',
    description: '',
    status: 'active',
    tags: [],
    data: {},
    currentVersionId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    archivedAt: null,
    ...overrides,
  };
}

function generation(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'gen_1',
    projectId: 'prj_1',
    capability: 'image.generate',
    provider: 'openai',
    model: 'dall-e-3',
    prompt: 'A young salvager in a weathered modular spacesuit',
    parameters: { size: '1024x1024' },
    status: 'complete',
    inputEntityIds: [],
    inputAssetIds: [],
    contextEntityIds: [],
    resolvedContext: null,
    outputAssetIds: ['ast_1'],
    parentGenerationId: null,
    seed: '4711',
    providerRequestId: null,
    failure: null,
    attempts: [],
    createdAt: new Date('2026-01-10T12:00:00Z'),
    startedAt: null,
    completedAt: null,
    createdBy: null,
    ...overrides,
  };
}

function selection(overrides: Partial<AssetSelection> = {}): AssetSelection {
  return {
    id: 'sel_1',
    projectId: 'prj_1',
    assetId: 'ast_1',
    context: { entityId: 'ent_kael', purpose: 'portrait' },
    state: 'approved',
    actor: 'You',
    note: null,
    supersededBySelectionId: null,
    decidedAt: new Date('2026-03-01T09:00:00.000Z'),
    ...overrides,
  };
}

function renderInspector(
  props: {
    asset?: Asset;
    summary?: AssetSummary;
    onCompare?: (other: Asset) => void;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AssetInspector
        projectId="prj_1"
        asset={props.asset ?? asset()}
        summary={props.summary ?? summary()}
        onClose={vi.fn()}
        onCompare={props.onCompare ?? vi.fn()}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listGenerationsForAsset).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(api.listGenerations).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(api.listAssets).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(api.listAssetSelectionsForAsset).mockResolvedValue([]);
  vi.mocked(api.listAssetMarks).mockResolvedValue([]);
  vi.mocked(api.getAssetSelectionSummary).mockImplementation(
    (_projectId: string, context: AssetSelectionContext) =>
      Promise.resolve({ context, current: [], history: [] }),
  );
  vi.mocked(api.listEntities).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(api.collectionsForAsset).mockResolvedValue([]);
});

afterEach(cleanup);

describe('the preview', () => {
  it('shows an image asset as an image', async () => {
    renderInspector();

    expect(await screen.findByRole('img', { name: 'kael-suit.png' })).toBeDefined();
  });

  it('plays a video asset in a video element', () => {
    renderInspector({
      asset: asset({ filename: 'intro.mp4', kind: 'video', mimeType: 'video/mp4' }),
    });

    expect(screen.getByLabelText('intro.mp4').tagName).toBe('VIDEO');
  });

  it('plays an audio asset in an audio element, with the file facts beside it', () => {
    renderInspector({
      asset: asset({
        filename: 'sonar-ping.wav',
        kind: 'audio',
        mimeType: 'audio/wav',
        width: null,
        height: null,
        durationSeconds: 65,
      }),
    });

    expect(screen.getByLabelText('sonar-ping.wav').tagName).toBe('AUDIO');
    expect(screen.getAllByText('Audio').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1:05/).length).toBeGreaterThan(0);
  });

  it('gives a file with no browser preview the facts that identify it', () => {
    renderInspector({
      asset: asset({
        filename: 'crate.glb',
        kind: 'model_3d',
        mimeType: 'model/gltf-binary',
        width: null,
        height: null,
      }),
    });

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getAllByText('3D Model').length).toBeGreaterThan(0);
    expect(screen.getByText('model/gltf-binary')).toBeDefined();
  });

  it('falls back to the same placeholder when the bytes cannot be read', async () => {
    renderInspector();

    fireEvent.error(await screen.findByRole('img', { name: 'kael-suit.png' }));

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('These bytes could not be read from storage.')).toBeDefined();
  });
});

describe('overview', () => {
  it('says the file is in no collection when it is in none', async () => {
    renderInspector();

    expect(await screen.findByText('Not in a collection')).toBeDefined();
  });

  it('lists every collection the file is in — the multi-collection case', async () => {
    vi.mocked(api.collectionsForAsset).mockResolvedValue([
      collectionEntity(),
      collectionEntity({ id: 'col_ui', name: 'UI & HUD' }),
    ]);

    renderInspector();

    expect(await screen.findByText('Props & Gear')).toBeDefined();
    expect(screen.getByText('UI & HUD')).toBeDefined();
  });

  it('removes only the membership, never the asset, from a chip', async () => {
    vi.mocked(api.collectionsForAsset).mockResolvedValue([collectionEntity()]);
    vi.mocked(api.removeAssetFromCollection).mockResolvedValue(undefined);
    renderInspector();

    fireEvent.click(await screen.findByRole('button', { name: 'Remove tag Props & Gear' }));

    await waitFor(() =>
      expect(api.removeAssetFromCollection).toHaveBeenCalledWith('prj_1', 'col_props', 'ast_1'),
    );
    expect(api.archiveAsset).not.toHaveBeenCalled();
  });

  it('adds the file to a collection chosen from the picker', async () => {
    vi.mocked(api.listEntities).mockResolvedValue({
      items: [collectionEntity({ id: 'col_ui', name: 'UI & HUD' })],
      total: 1,
    });
    vi.mocked(api.addAssetToCollection).mockResolvedValue({
      id: 'rel_1',
      projectId: 'prj_1',
      sourceEntityId: 'col_ui',
      targetEntityId: 'ref_1',
      relation: 'contains',
      metadata: {},
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    renderInspector();

    const picker = await screen.findByLabelText('Add to collection');
    fireEvent.change(picker, { target: { value: 'col_ui' } });

    await waitFor(() =>
      expect(api.addAssetToCollection).toHaveBeenCalledWith('prj_1', 'col_ui', 'ast_1'),
    );
  });
});

describe('provenance', () => {
  it('shows the prompt, seed and references of a generated asset', async () => {
    vi.mocked(api.listGenerationsForAsset).mockResolvedValue({
      items: [generation({ inputAssetIds: ['ast_ref'] })],
      total: 1,
    });
    vi.mocked(api.getGenerationProvenance).mockResolvedValue({
      generation: generation(),
      parent: null,
      inputEntities: [],
      contextEntities: [],
      inputAssets: [asset({ id: 'ast_ref', filename: 'plate.png' })],
      outputAssets: [asset()],
    });

    renderInspector({
      summary: summary({
        origin: 'generated',
        generation: {
          generationId: 'gen_1',
          capability: 'image.generate',
          provider: 'openai',
          model: 'dall-e-3',
        },
      }),
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Generation' }));

    expect(
      await screen.findByText('A young salvager in a weathered modular spacesuit'),
    ).toBeDefined();
    expect(screen.getByText('image.generate · dall-e-3')).toBeDefined();
    expect(screen.getByText('4711')).toBeDefined();
    expect(screen.getByText('plate.png')).toBeDefined();
    expect(screen.getByText('1024x1024')).toBeDefined();
  });

  it('says plainly that an imported asset was imported', () => {
    renderInspector();

    expect(screen.getByText('Imported')).toBeDefined();

    fireEvent.click(screen.getByRole('tab', { name: 'Generation' }));

    expect(screen.getByText(/This file was imported/)).toBeDefined();
  });
});

describe('usage', () => {
  it('lists the entities that reference the file, each opening its canonical route', () => {
    renderInspector({
      summary: summary({
        linkedEntities: {
          entities: [
            linkedEntity(),
            linkedEntity({ entityId: 'ent_outpost', name: 'Ravine Outpost', type: 'location' }),
          ],
          total: 6,
        },
      }),
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Usage' }));

    const kael = screen.getByRole('link', { name: /Kael/ });
    expect(kael.getAttribute('href')).toBe('/projects/prj_1/entities/ent_kael');
    expect(screen.getByRole('link', { name: /Ravine Outpost/ })).toBeDefined();
    expect(screen.getByText('4 more objects reference this file.')).toBeDefined();
  });

  it('says nothing links to the file when nothing does', () => {
    renderInspector();

    fireEvent.click(screen.getByRole('tab', { name: 'Usage' }));

    expect(screen.getByText(/Nothing references this file yet/)).toBeDefined();
  });
});

describe('review', () => {
  const kael = linkedEntity();
  const vessa = linkedEntity({ entityId: 'ent_vessa', name: 'Vessa' });

  function twoContexts(): AssetSummary {
    return summary({ linkedEntities: { entities: [kael, vessa], total: 2 } });
  }

  it('shows where the file stands in every context it was considered for', async () => {
    vi.mocked(api.listAssetSelectionsForAsset).mockResolvedValue([
      selection({
        id: 'sel_2',
        context: { entityId: 'ent_vessa', purpose: 'portrait' },
        state: 'rejected',
      }),
      selection(),
    ]);

    renderInspector({ summary: twoContexts() });

    const review = await screen.findByRole('region', { name: 'Review' });
    expect(await within(review).findByText(/for Kael/)).toBeDefined();
    expect(within(review).getByText(/for Vessa/)).toBeDefined();
    expect(within(review).getByText('Approved')).toBeDefined();
    expect(within(review).getByText('Rejected')).toBeDefined();
  });

  it('asks which context a decision is for, and records the one chosen', async () => {
    renderInspector({ summary: twoContexts() });

    fireEvent.change(await screen.findByLabelText('Deciding for'), {
      target: { value: 'ent_vessa' },
    });
    fireEvent.change(screen.getByLabelText('Deciding as'), { target: { value: 'costume' } });

    const approve = await screen.findByRole('button', { name: /Approve as costume exploration/ });
    await waitFor(() => expect(approve).toHaveProperty('disabled', false));
    fireEvent.click(approve);

    await waitFor(() => {
      expect(vi.mocked(api.approveAssetSelection)).toHaveBeenCalledWith(
        'prj_1',
        expect.objectContaining({
          assetId: 'ast_1',
          entityId: 'ent_vessa',
          purpose: 'costume',
        }),
      );
    });
  });

  it('will not invent a context for a file nothing links to', () => {
    renderInspector();

    expect(screen.queryByLabelText('Deciding for')).toBeNull();
    expect(
      screen.getByText(/Link this file to a character, board or location first/),
    ).toBeDefined();
  });
});

describe('history', () => {
  it('lists the derivatives and other takes, and compares one of them', async () => {
    const onCompare = vi.fn();
    const thumbnail = asset({
      id: 'ast_thumb',
      filename: 'kael-suit-thumb.png',
      variant: 'thumbnail',
      sourceAssetId: 'ast_1',
    });
    const otherTake = asset({ id: 'ast_2', filename: 'kael-suit-take-2.png' });

    vi.mocked(api.listGenerationsForAsset).mockResolvedValue({ items: [generation()], total: 1 });
    vi.mocked(api.listAssets).mockResolvedValue({ items: [thumbnail], total: 1 });
    vi.mocked(api.listGenerations).mockResolvedValue({
      items: [generation({ id: 'gen_2', parentGenerationId: 'gen_1', outputAssetIds: ['ast_2'] })],
      total: 1,
    });
    vi.mocked(api.getAsset).mockResolvedValue(otherTake);

    renderInspector({ onCompare });

    fireEvent.click(screen.getByRole('tab', { name: 'History' }));

    expect(await screen.findByText('kael-suit-thumb.png')).toBeDefined();
    expect(await screen.findByText('kael-suit-take-2.png')).toBeDefined();
    expect(screen.getByText(/Derived from this/)).toBeDefined();
    expect(screen.getByText(/Another take/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Compare with kael-suit-take-2.png' }));
    expect(onCompare).toHaveBeenCalledWith(otherTake);
  });

  it('says when nothing has been decided and nothing derives from the file', async () => {
    renderInspector();

    fireEvent.click(screen.getByRole('tab', { name: 'History' }));

    expect(await screen.findByText('Nothing has been decided about this file yet.')).toBeDefined();
    expect(
      screen.getByText('Nothing was derived from this file, and no other takes exist.'),
    ).toBeDefined();
  });
});

describe('actions', () => {
  it('opens and downloads the file through the API', () => {
    renderInspector();

    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(
      'https://api.test/projects/prj_1/assets/ast_1/content',
    );
    expect(screen.getByRole('link', { name: 'Download' }).getAttribute('href')).toBe(
      'https://api.test/projects/prj_1/assets/ast_1/content?download=true',
    );
  });

  it('archives the file', async () => {
    vi.mocked(api.archiveAsset).mockResolvedValue(asset({ status: 'archived' }));

    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => {
      expect(vi.mocked(api.archiveAsset)).toHaveBeenCalledWith('prj_1', 'ast_1');
    });
  });

  it('offers restore rather than archive on an archived file, and holds off decisions', async () => {
    vi.mocked(api.restoreAsset).mockResolvedValue(asset());

    renderInspector({
      asset: asset({ status: 'archived', archivedAt: new Date('2026-02-01T00:00:00Z') }),
      summary: summary({ linkedEntities: { entities: [linkedEntity()], total: 1 } }),
    });

    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Review' })).toBeNull();
    expect(screen.getAllByText('Archived').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => {
      expect(vi.mocked(api.restoreAsset)).toHaveBeenCalledWith('prj_1', 'ast_1');
    });
  });

  it('opens the generation panel with the file as its reference, for images only', async () => {
    vi.mocked(api.listJobs).mockResolvedValue({ items: [], total: 0 });

    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: /Variations/ }));

    expect(screen.getByRole('button', { name: /Vary this image/ })).toBeDefined();
    expect(await screen.findByText('Reference images')).toBeDefined();
  });

  it('offers no variation for a file image generation cannot work from', () => {
    renderInspector({
      asset: asset({ filename: 'build.zip', kind: 'build_artifact', mimeType: 'application/zip' }),
    });

    expect(screen.queryByRole('button', { name: /Variations/ })).toBeNull();
  });
});

describe('pipeline stage', () => {
  it('advances a concept asset to in progress, then to production ready', async () => {
    vi.mocked(api.setAssetPipelineStage).mockResolvedValue(asset({ pipelineStage: 'in_progress' }));

    renderInspector({ asset: asset({ pipelineStage: 'concept' }) });

    const select = screen.getByLabelText('Pipeline stage') as HTMLSelectElement;
    expect(select.value).toBe('concept');

    fireEvent.change(select, { target: { value: 'in_progress' } });

    await waitFor(() => {
      expect(vi.mocked(api.setAssetPipelineStage)).toHaveBeenCalledWith(
        'prj_1',
        'ast_1',
        'in_progress',
      );
    });
  });

  it('advances a concept asset straight to production ready', async () => {
    vi.mocked(api.setAssetPipelineStage).mockResolvedValue(
      asset({ pipelineStage: 'production_ready' }),
    );

    renderInspector({ asset: asset({ pipelineStage: 'concept' }) });

    fireEvent.change(screen.getByLabelText('Pipeline stage'), {
      target: { value: 'production_ready' },
    });

    await waitFor(() => {
      expect(vi.mocked(api.setAssetPipelineStage)).toHaveBeenCalledWith(
        'prj_1',
        'ast_1',
        'production_ready',
      );
    });
  });

  it('sends a production ready asset back to concept just as readily', async () => {
    vi.mocked(api.setAssetPipelineStage).mockResolvedValue(asset({ pipelineStage: 'concept' }));

    renderInspector({ asset: asset({ pipelineStage: 'production_ready' }) });

    const select = screen.getByLabelText('Pipeline stage') as HTMLSelectElement;
    expect(select.value).toBe('production_ready');

    fireEvent.change(select, { target: { value: 'concept' } });

    await waitFor(() => {
      expect(vi.mocked(api.setAssetPipelineStage)).toHaveBeenCalledWith(
        'prj_1',
        'ast_1',
        'concept',
      );
    });
  });

  it('sends an in-progress asset back to concept', async () => {
    vi.mocked(api.setAssetPipelineStage).mockResolvedValue(asset({ pipelineStage: 'concept' }));

    renderInspector({ asset: asset({ pipelineStage: 'in_progress' }) });

    fireEvent.change(screen.getByLabelText('Pipeline stage'), { target: { value: 'concept' } });

    await waitFor(() => {
      expect(vi.mocked(api.setAssetPipelineStage)).toHaveBeenCalledWith(
        'prj_1',
        'ast_1',
        'concept',
      );
    });
  });

  it('reports an error rather than losing it silently', async () => {
    vi.mocked(api.setAssetPipelineStage).mockRejectedValue(new Error('Network down'));

    renderInspector({ asset: asset({ pipelineStage: 'concept' }) });
    fireEvent.change(screen.getByLabelText('Pipeline stage'), {
      target: { value: 'in_progress' },
    });

    expect(await screen.findByText('Network down')).toBeDefined();
  });
});

describe('overview', () => {
  it('shows the pipeline stage as its own row, alongside the status badge', () => {
    renderInspector({
      asset: asset({ pipelineStage: 'in_progress' }),
      summary: summary({ approved: true }),
    });

    // Status is the badge summary ("Approved" wins precedence over the raw
    // stage); Stage is the axis on its own, per §6.5's note. Scoped off the
    // dt so it isn't confused with the stage select's own "In Progress" option.
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0);
    expect(screen.getByText('Stage').nextElementSibling?.textContent).toBe('In Progress');
  });
});
