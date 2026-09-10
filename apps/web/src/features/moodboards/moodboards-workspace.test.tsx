// @vitest-environment jsdom
import type {
  Asset,
  AssetPage,
  Entity,
  EntityPage,
  Generation,
  Moodboard,
  MoodboardConnector,
  MoodboardNode,
} from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MoodboardsWorkspace } from './moodboards-workspace';
import type { MoodboardCanvasActions } from './moodboard-toolbar';

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  listEntities: vi.fn(),
  listAssets: vi.fn(),
  createEntity: vi.fn(),
  getMoodboard: vi.fn(),
  addMoodboardNode: vi.fn(),
  updateMoodboardNodes: vi.fn(),
  duplicateMoodboardNodes: vi.fn(),
  removeMoodboardNode: vi.fn(),
  removeMoodboardNodes: vi.fn(),
  connectMoodboardNodes: vi.fn(),
  deleteMoodboardConnector: vi.fn(),
  promoteMoodboardConnector: vi.fn(),
  assetContentUrl: (projectId: string, assetId: string) => `/assets/${projectId}/${assetId}`,
  listGenerations: vi.fn(),
  createGeneration: vi.fn(),
  getGeneration: vi.fn(),
  getGenerationProvenance: vi.fn(),
  cancelGeneration: vi.fn(),
  getAsset: vi.fn(),
  listJobs: vi.fn(),
  jobStreamUrl: (projectId: string) => `/jobs/${projectId}/stream`,
}));

/**
 * The canvas has its own tests: the projection in `moodboard.test.ts`, the
 * geometry in `moodboard-geometry.test.ts` and the gestures in
 * `moodboard-canvas.test.tsx`. What this file tests is the screen around it, so
 * the canvas stands in as the actions it can fire.
 */
vi.mock('./moodboard-canvas', () => ({
  MoodboardCanvas: ({
    nodes,
    actions,
    onSelectionChange,
  }: {
    nodes: readonly MoodboardNode[];
    actions: MoodboardCanvasActions;
    onSelectionChange: (nodeIds: readonly string[]) => void;
  }) => (
    <div data-testid="canvas">
      <p>{nodes.length} nodes</p>
      <button type="button" onClick={() => onSelectionChange([nodes[0]!.id])}>
        Select first
      </button>
      <button type="button" onClick={() => onSelectionChange([nodes[1]!.id])}>
        Select second
      </button>
      <button type="button" onClick={() => actions.removeNodes([nodes[0]!.id])}>
        Remove first
      </button>
      <button type="button" onClick={() => actions.duplicateNodes([nodes[0]!.id])}>
        Duplicate first
      </button>
    </div>
  ),
}));

const api = await import('@/lib/api');

const BOARD: Entity = {
  id: 'board_1',
  projectId: 'prj_1',
  type: 'moodboard',
  name: 'Wreck interiors',
  description: null,
  status: 'active',
  tags: [],
  data: {},
  currentVersionId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
};

const REEF: Asset = {
  id: 'asset_reef',
  projectId: 'prj_1',
  kind: 'image',
  filename: 'reef.png',
  mimeType: 'image/png',
  byteSize: 12,
  storageKey: 'prj_1/reef.png',
  checksum: 'abc',
  width: 100,
  height: 100,
  durationSeconds: null,
  variant: 'source',
  sourceAssetId: null,
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
  createdBy: null,
};

const TAM: Entity = { ...BOARD, id: 'ent_tam', type: 'character', name: 'Tam' };

function node(overrides: Partial<MoodboardNode> = {}): MoodboardNode {
  return {
    id: 'node_1',
    projectId: 'prj_1',
    boardId: 'board_1',
    type: 'asset',
    assetId: REEF.id,
    entityId: null,
    groupId: null,
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    rotation: 0,
    zOrder: 0,
    locked: false,
    data: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function board(overrides: Partial<Moodboard> = {}): Moodboard {
  return { board: BOARD, nodes: [node()], connectors: [], ...overrides };
}

function entityPage(items: Entity[]): EntityPage {
  return { items, total: items.length };
}

function assetPage(items: Asset[]): AssetPage {
  return { items, total: items.length };
}

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MoodboardsWorkspace projectId="prj_1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listEntities).mockImplementation(async (_projectId, params) =>
    params?.type?.includes('moodboard') ? entityPage([BOARD]) : entityPage([TAM]),
  );
  vi.mocked(api.listAssets).mockResolvedValue(assetPage([REEF]));
  vi.mocked(api.getMoodboard).mockResolvedValue(board());
  vi.mocked(api.addMoodboardNode).mockResolvedValue(node({ id: 'node_new' }));
  vi.mocked(api.updateMoodboardNodes).mockResolvedValue([]);
  vi.mocked(api.duplicateMoodboardNodes).mockResolvedValue([node({ id: 'node_copy' })]);
  vi.mocked(api.removeMoodboardNode).mockResolvedValue(undefined);
  vi.mocked(api.listGenerations).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(api.listJobs).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(api.promoteMoodboardConnector).mockResolvedValue({
    connector: connector({ relationshipId: 'rel_1' }),
    relationship: {
      id: 'rel_1',
      projectId: 'prj_1',
      sourceEntityId: 'ent_tam',
      targetEntityId: 'ent_reef',
      relation: 'references',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
});

afterEach(cleanup);

function connector(overrides: Partial<MoodboardConnector> = {}): MoodboardConnector {
  return {
    id: 'conn_1',
    projectId: 'prj_1',
    boardId: 'board_1',
    fromNodeId: 'node_a',
    toNodeId: 'node_b',
    label: null,
    relationshipId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('opening a board', () => {
  it('starts with nothing open rather than guessing a board', async () => {
    renderWorkspace();

    expect(await screen.findByText('No board open')).toBeTruthy();
    expect(api.getMoodboard).not.toHaveBeenCalled();
  });

  it('shows the boards while they load, then lists them', async () => {
    renderWorkspace();

    expect(screen.getByText('Loading boards…')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Wreck interiors' })).toBeTruthy();
  });

  it('says so when the boards cannot be read', async () => {
    vi.mocked(api.listEntities).mockRejectedValue(new Error('API is down'));
    renderWorkspace();

    expect(await screen.findByText("Couldn't load boards")).toBeTruthy();
    expect(screen.getByText('API is down')).toBeTruthy();
  });

  it('opens a board and draws what is on it', async () => {
    renderWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: 'Wreck interiors' }));

    expect(await screen.findByTestId('canvas')).toBeTruthy();
    expect(screen.getByText('1 nodes')).toBeTruthy();
    expect(api.getMoodboard).toHaveBeenCalledWith('prj_1', 'board_1');
  });

  it('says so when the board itself cannot be opened', async () => {
    vi.mocked(api.getMoodboard).mockRejectedValue(new Error('Board is missing'));
    renderWorkspace();

    fireEvent.click(await screen.findByRole('button', { name: 'Wreck interiors' }));

    expect(await screen.findByText("Couldn't open this board")).toBeTruthy();
    expect(screen.getByText('Board is missing')).toBeTruthy();
  });

  it('opens a new board as soon as it is created', async () => {
    vi.mocked(api.createEntity).mockResolvedValue({ ...BOARD, id: 'board_new', name: 'Palette' });
    renderWorkspace();

    fireEvent.change(await screen.findByLabelText('New board name'), {
      target: { value: 'Palette' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(api.getMoodboard).toHaveBeenCalledWith('prj_1', 'board_new'));
    expect(api.createEntity).toHaveBeenCalledWith('prj_1', { type: 'moodboard', name: 'Palette' });
  });
});

describe('placing and removing', () => {
  async function openBoard() {
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Wreck interiors' }));
    await screen.findByTestId('canvas');
  }

  it('places an asset by reference rather than copying it', async () => {
    await openBoard();

    fireEvent.click(await screen.findByRole('button', { name: /reef\.png/ }));

    await waitFor(() =>
      expect(api.addMoodboardNode).toHaveBeenCalledWith(
        'prj_1',
        'board_1',
        expect.objectContaining({ type: 'asset', assetId: 'asset_reef' }),
      ),
    );
  });

  it('places an entity by reference', async () => {
    await openBoard();

    fireEvent.click(await screen.findByRole('button', { name: /Tam/ }));

    await waitFor(() =>
      expect(api.addMoodboardNode).toHaveBeenCalledWith(
        'prj_1',
        'board_1',
        expect.objectContaining({ type: 'entity', entityId: 'ent_tam' }),
      ),
    );
  });

  it('removes the placement and nothing else', async () => {
    await openBoard();

    fireEvent.click(screen.getByRole('button', { name: 'Remove first' }));

    await waitFor(() =>
      expect(api.removeMoodboardNodes).toHaveBeenCalledWith('prj_1', 'board_1', ['node_1']),
    );
    expect(api.updateMoodboardNodes).not.toHaveBeenCalled();
  });

  it('duplicates the placement, not the asset behind it', async () => {
    await openBoard();

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate first' }));

    await waitFor(() =>
      expect(api.duplicateMoodboardNodes).toHaveBeenCalledWith('prj_1', 'board_1', ['node_1']),
    );
    expect(api.addMoodboardNode).not.toHaveBeenCalled();
  });

  it('assigns z-order based on the max present, not array length, so creation after deletion does not collide', async () => {
    const node1 = node({ id: 'node_1', zOrder: 0 });
    const node2 = node({ id: 'node_2', zOrder: 1 });
    const node3 = node({ id: 'node_3', zOrder: 2 });
    vi.mocked(api.getMoodboard).mockResolvedValue(board({ nodes: [node1, node2, node3] }));
    await openBoard();

    // After removing node_1, nodes.length is 2, but max zOrder is still 2.
    // The new node should get zOrder 3, not 2 (which would collide with node_3).
    fireEvent.click(screen.getByRole('button', { name: 'Remove first' }));
    await waitFor(() =>
      expect(api.removeMoodboardNode).toHaveBeenCalledWith('prj_1', 'board_1', 'node_1'),
    );

    fireEvent.click(await screen.findByRole('button', { name: /reef\.png/ }));
    await waitFor(() =>
      expect(api.addMoodboardNode).toHaveBeenCalledWith(
        'prj_1',
        'board_1',
        expect.objectContaining({ zOrder: 3 }),
      ),
    );
  });

  it('adds a generated result to the board as a placement, not a copy', async () => {
    const finished = {
      id: 'gen_1',
      projectId: 'prj_1',
      capability: 'image.generate',
      provider: 'local-image',
      model: 'local-plate-1',
      prompt: 'a trench',
      parameters: {},
      status: 'complete',
      inputEntityIds: [],
      inputAssetIds: [],
      contextEntityIds: [],
      resolvedContext: null,
      outputAssetIds: ['ast_new'],
      parentGenerationId: null,
      seed: null,
      providerRequestId: null,
      failure: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      createdBy: null,
    } satisfies Generation;
    vi.mocked(api.listGenerations).mockResolvedValue({ items: [finished], total: 1 });
    vi.mocked(api.getGeneration).mockResolvedValue(finished);
    vi.mocked(api.getAsset).mockResolvedValue({ ...REEF, id: 'ast_new', filename: 'result.svg' });
    await openBoard();

    fireEvent.click(await screen.findByRole('button', { name: 'Add to board' }));

    await waitFor(() =>
      expect(api.addMoodboardNode).toHaveBeenCalledWith(
        'prj_1',
        'board_1',
        expect.objectContaining({ type: 'asset', assetId: 'ast_new' }),
      ),
    );
  });

  it('says what a selected node points at, and that removing it is safe', async () => {
    await openBoard();

    fireEvent.click(screen.getByRole('button', { name: 'Select first' }));

    // Scoped to the field: the same filename also appears in the rail's library
    // and in the generator's reference list, and neither is what this asserts.
    const shows = await screen.findByText('Shows asset');
    expect(shows.parentElement?.textContent).toContain('reef.png');
    expect(screen.getByText(/any number of boards/)).toBeTruthy();
  });
});

function textField(element: HTMLElement): string {
  if (!(element instanceof HTMLTextAreaElement)) throw new Error('Not a text field');
  return element.value;
}

describe('editing what a node says', () => {
  const FIRST = node({ id: 'node_a', type: 'note', assetId: null, data: { text: 'Colder' } });
  const SECOND = node({ id: 'node_b', type: 'note', assetId: null, data: { text: 'Warmer' } });

  async function openBoardWithNotes() {
    vi.mocked(api.getMoodboard).mockResolvedValue(board({ nodes: [FIRST, SECOND] }));
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Wreck interiors' }));
    await screen.findByTestId('canvas');
  }

  it('shows the node that is selected now, not the one selected before it', async () => {
    await openBoardWithNotes();

    fireEvent.click(screen.getByRole('button', { name: 'Select first' }));
    expect(textField(await screen.findByLabelText('Text'))).toBe('Colder');

    fireEvent.click(screen.getByRole('button', { name: 'Select second' }));

    expect(textField(screen.getByLabelText('Text'))).toBe('Warmer');
  });

  it("never writes one note's text onto another", async () => {
    await openBoardWithNotes();
    fireEvent.click(screen.getByRole('button', { name: 'Select first' }));
    fireEvent.change(await screen.findByLabelText('Text'), { target: { value: 'Colder still' } });

    fireEvent.click(screen.getByRole('button', { name: 'Select second' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Warmer still' } });

    await waitFor(() =>
      expect(api.updateMoodboardNodes).toHaveBeenCalledWith('prj_1', 'board_1', [
        { id: 'node_b', data: { text: 'Warmer still' } },
      ]),
    );
    // The first note's edit went to the first note, and nowhere else.
    expect(api.updateMoodboardNodes).toHaveBeenCalledWith('prj_1', 'board_1', [
      { id: 'node_a', data: { text: 'Colder still' } },
    ]);
    expect(api.updateMoodboardNodes).toHaveBeenCalledTimes(2);
  });

  it('sends one request per pause rather than one per keystroke', async () => {
    await openBoardWithNotes();
    fireEvent.click(screen.getByRole('button', { name: 'Select first' }));
    const field = await screen.findByLabelText('Text');

    for (const value of ['C', 'Co', 'Col']) {
      fireEvent.change(field, { target: { value } });
    }
    expect(api.updateMoodboardNodes).not.toHaveBeenCalled();

    await waitFor(() => expect(api.updateMoodboardNodes).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    });
    expect(api.updateMoodboardNodes).toHaveBeenCalledWith('prj_1', 'board_1', [
      { id: 'node_a', data: { text: 'Col' } },
    ]);
  });
});

describe('connectors', () => {
  it('offers no promotion until a line exists', async () => {
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Wreck interiors' }));

    expect(await screen.findByText(/until you promote it/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Promote' })).toBeNull();
  });

  it('promotes a line only when the button is pressed, with the relation chosen', async () => {
    const from = node({ id: 'node_a', type: 'entity', assetId: null, entityId: 'ent_tam' });
    const to = node({ id: 'node_b', type: 'entity', assetId: null, entityId: 'ent_reef' });
    vi.mocked(api.getMoodboard).mockResolvedValue(
      board({ nodes: [from, to], connectors: [connector()] }),
    );
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Wreck interiors' }));

    const promote = await screen.findByRole('button', { name: 'Promote' });
    expect(api.promoteMoodboardConnector).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'appears_in' } });
    fireEvent.click(promote);

    await waitFor(() =>
      expect(api.promoteMoodboardConnector).toHaveBeenCalledWith(
        'prj_1',
        'board_1',
        'conn_1',
        'appears_in',
      ),
    );
  });

  it('will not offer to promote a line that is not between two entities', async () => {
    const from = node({ id: 'node_a' });
    const to = node({ id: 'node_b' });
    vi.mocked(api.getMoodboard).mockResolvedValue(
      board({ nodes: [from, to], connectors: [connector()] }),
    );
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Wreck interiors' }));

    expect(await screen.findByText(/two entity references/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Promote' })).toBeNull();
  });
});
