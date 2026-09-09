// @vitest-environment jsdom
import type {
  Entity,
  EntityPage,
  EntityType,
  NeighborEdge,
  RelationType,
} from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorldWorkspace } from './world-workspace';

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  listEntities: vi.fn(),
  getEntity: vi.fn(),
  createEntity: vi.fn(),
  updateEntity: vi.fn(),
  archiveEntity: vi.fn(),
  restoreEntity: vi.fn(),
  getEntityNeighborhood: vi.fn(),
  getEntityHistory: vi.fn(),
  createRelationship: vi.fn(),
  deleteRelationship: vi.fn(),
  commitEntityVersion: vi.fn(),
  restoreEntityVersion: vi.fn(),
}));

const api = await import('@/lib/api');

function worldEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_belt',
    projectId: 'prj_1',
    type: 'region' as EntityType,
    name: 'The Shattered Belt',
    description: 'A frontier of dead empires and corporate claims.',
    status: 'active',
    tags: ['Vacuum'],
    data: {
      era: 'c. 2230',
      canonStatus: 'canon',
      risk: 'high',
      keepMe: 'a field this workspace does not own',
    },
    currentVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    ...overrides,
  };
}

const WARDENS = worldEntity({
  id: 'ent_wardens',
  type: 'faction',
  name: 'The Wardens',
  description: 'Order in the drift.',
  tags: ['Military'],
  data: { canonStatus: 'proposed', risk: 'none' },
});

function page(items: Entity[]): EntityPage {
  return { items, total: items.length };
}

function edge(
  entity: Entity,
  relation: RelationType,
  direction: 'outgoing' | 'incoming',
): NeighborEdge {
  return {
    relationship: {
      id: `rel_${entity.id}`,
      projectId: 'prj_1',
      sourceEntityId: direction === 'outgoing' ? 'ent_belt' : entity.id,
      targetEntityId: direction === 'outgoing' ? entity.id : 'ent_belt',
      relation,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    direction,
    entity,
  };
}

/** The list column, so a query does not also see the composer in the inspector. */
function browser() {
  return within(screen.getByRole('region', { name: 'World canon' }));
}

function detail() {
  return screen.findByRole('region', { name: 'World detail' });
}

function openTab(name: string) {
  fireEvent.click(screen.getByRole('tab', { name }));
}

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <WorldWorkspace projectId="prj_1" />
    </QueryClientProvider>,
  );
}

describe('World workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listEntities).mockResolvedValue(page([]));
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue({
      entity: worldEntity(),
      outgoing: [],
      incoming: [],
    });
    vi.mocked(api.getEntityHistory).mockResolvedValue({
      entityId: 'ent_belt',
      currentVersionId: null,
      branches: [],
      versions: [],
      total: 0,
    });
  });

  // Vitest globals are off in this workspace, so RTL's own auto-cleanup never
  // registers itself.
  afterEach(cleanup);

  describe('dashboard', () => {
    it('shows skeletons rather than an empty world while the first page loads', () => {
      vi.mocked(api.listEntities).mockReturnValue(new Promise(() => {}));

      renderWorkspace();

      expect(screen.getByRole('status', { name: 'Loading the world' })).toBeDefined();
      expect(screen.queryByText('The world is empty')).toBeNull();
    });

    it('says what went wrong and offers a retry when the world cannot be read', async () => {
      vi.mocked(api.listEntities).mockRejectedValue(new Error('Service unavailable'));

      renderWorkspace();

      await screen.findByText("Couldn't load the world");
      expect(screen.getByText('Service unavailable')).toBeDefined();

      vi.mocked(api.listEntities).mockResolvedValue(page([worldEntity()]));
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

      await screen.findByText('The Shattered Belt');
    });

    it('invites a first place when the project has no world at all', async () => {
      renderWorkspace();

      await screen.findByText('The world is empty');
      expect(screen.getByRole('button', { name: 'Create a region' })).toBeDefined();
    });

    it('groups the world into its named views', async () => {
      vi.mocked(api.listEntities).mockResolvedValue(page([worldEntity(), WARDENS]));

      renderWorkspace();

      await screen.findByText('Major Factions');
      expect(screen.getByText('Key Locations')).toBeDefined();
      expect(screen.getByText('Regions')).toBeDefined();
      expect(screen.getByText('Timeline')).toBeDefined();
      expect(screen.getByText('Environment Tags')).toBeDefined();
      expect(screen.getByText('Hazards')).toBeDefined();
    });

    it('orders the timeline by the setting’s own calendar', async () => {
      const collapse = worldEntity({
        id: 'ent_collapse',
        type: 'event',
        name: 'The Collapse',
        description: null,
        data: { era: 'c. 2226' },
      });
      const expansion = worldEntity({
        id: 'ent_expansion',
        type: 'event',
        name: 'The Expansion',
        description: null,
        data: { era: 'c. 2180' },
      });
      vi.mocked(api.listEntities).mockResolvedValue(page([collapse, expansion]));

      renderWorkspace();

      const events = await screen.findAllByRole('button', { name: /The (Collapse|Expansion)/ });
      expect(events.map((button) => button.textContent)).toEqual([
        'c. 2180The Expansion',
        'c. 2226The Collapse',
      ]);
    });

    it('opens the browser filtered to a tag the world already uses', async () => {
      vi.mocked(api.listEntities).mockResolvedValue(page([worldEntity(), WARDENS]));

      renderWorkspace();

      fireEvent.click(
        await screen.findByRole('button', { name: 'Browse everything tagged Vacuum' }),
      );

      await waitFor(() => expect(browser().queryByText('The Wardens')).toBeNull());
      expect(browser().getByText('The Shattered Belt')).toBeDefined();
    });
  });

  describe('browsing the canon', () => {
    it('tells a fruitless search apart from an empty world', async () => {
      renderWorkspace();
      await screen.findByText('The world is empty');
      openTab('Canon');

      fireEvent.change(screen.getByRole('searchbox', { name: 'Search the world' }), {
        target: { value: 'derelict' },
      });

      await screen.findByText('Nothing in the world matches these filters');
    });

    it('has its own empty state for the archived shelf', async () => {
      renderWorkspace();
      await screen.findByText('The world is empty');
      openTab('Canon');

      fireEvent.change(screen.getByRole('combobox', { name: 'Filter by lifecycle' }), {
        target: { value: 'archived' },
      });

      await screen.findByText('Nothing archived');
    });

    it('narrows by kind and by canon status, which the listing endpoint cannot filter on', async () => {
      vi.mocked(api.listEntities).mockResolvedValue(page([worldEntity(), WARDENS]));

      renderWorkspace();
      await screen.findByText('Major Factions');
      openTab('Canon');
      await screen.findByText('The Wardens');

      fireEvent.change(screen.getByRole('combobox', { name: 'Filter by kind' }), {
        target: { value: 'faction' },
      });
      await waitFor(() => expect(browser().queryByText('The Shattered Belt')).toBeNull());

      fireEvent.change(screen.getByRole('combobox', { name: 'Filter by canon status' }), {
        target: { value: 'canon' },
      });
      await waitFor(() => expect(browser().queryByText('The Wardens')).toBeNull());
    });
  });

  describe('the entity in hand', () => {
    beforeEach(() => {
      vi.mocked(api.listEntities).mockResolvedValue(page([worldEntity()]));
      vi.mocked(api.getEntity).mockResolvedValue(worldEntity());
    });

    it('opens the detail surface on whatever was picked from the dashboard', async () => {
      renderWorkspace();

      fireEvent.click(await screen.findByText('The Shattered Belt'));

      const surface = within(await detail());
      expect(surface.getByLabelText('Name')).toHaveProperty('value', 'The Shattered Belt');
      expect(surface.getByLabelText('Era')).toHaveProperty('value', 'c. 2230');
    });

    it('saves structured edits without dropping the data it does not own', async () => {
      vi.mocked(api.updateEntity).mockResolvedValue(worldEntity());

      renderWorkspace();
      fireEvent.click(await screen.findByText('The Shattered Belt'));

      const surface = within(await detail());
      fireEvent.change(surface.getByLabelText('Canon'), { target: { value: 'contested' } });
      fireEvent.click(surface.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(api.updateEntity).toHaveBeenCalledOnce());
      const [, entityId, patch] = vi.mocked(api.updateEntity).mock.calls[0]!;
      expect(entityId).toBe('ent_belt');
      expect(patch.data?.canonStatus).toBe('contested');
      expect(patch.data?.era).toBe('c. 2230');
      expect(patch.data?.keepMe).toBe('a field this workspace does not own');
    });

    it('locks an archived place and offers to restore it instead', async () => {
      const archived = worldEntity({ status: 'archived', archivedAt: new Date() });
      vi.mocked(api.listEntities).mockResolvedValue(page([archived]));
      vi.mocked(api.getEntity).mockResolvedValue(archived);

      renderWorkspace();
      await screen.findByText('Regions');
      openTab('Canon');
      fireEvent.change(screen.getByRole('combobox', { name: 'Filter by lifecycle' }), {
        target: { value: 'archived' },
      });
      fireEvent.click(await browser().findByText('The Shattered Belt'));

      await screen.findByText('Restore this before editing it. Its links and history are intact.');
      expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Restore' })).toBeDefined();
    });

    it('reports a reference to an entity that is no longer there', async () => {
      vi.mocked(api.getEntity).mockRejectedValue(new Error('Entity not found'));

      renderWorkspace();
      fireEvent.click(await screen.findByText('The Shattered Belt'));

      await screen.findByText("Couldn't load this");
      expect(screen.getByText('Entity not found')).toBeDefined();
    });

    it('writes a link as a canonical relationship from the entity in hand', async () => {
      vi.mocked(api.createRelationship).mockResolvedValue({
        id: 'rel_1',
        projectId: 'prj_1',
        sourceEntityId: 'ent_belt',
        targetEntityId: 'ent_wardens',
        relation: 'controls',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(api.listEntities).mockResolvedValue(page([worldEntity(), WARDENS]));

      renderWorkspace();
      fireEvent.click(await screen.findByText('The Shattered Belt'));

      await screen.findByRole('option', { name: /The Wardens/ });
      fireEvent.change(screen.getByLabelText('Entity to link'), {
        target: { value: 'ent_wardens' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add link' }));

      await waitFor(() => expect(api.createRelationship).toHaveBeenCalledOnce());
      expect(vi.mocked(api.createRelationship).mock.calls[0]![2]).toEqual({
        targetEntityId: 'ent_wardens',
        relation: 'controls',
      });
    });
  });

  describe('relationships', () => {
    beforeEach(() => {
      vi.mocked(api.listEntities).mockResolvedValue(page([worldEntity(), WARDENS]));
      vi.mocked(api.getEntity).mockResolvedValue(worldEntity());
    });

    it('answers who holds a place and what is at stake there', async () => {
      const storm = worldEntity({ id: 'ent_storm', type: 'hazard', name: 'Radiation storms' });
      vi.mocked(api.getEntityNeighborhood).mockResolvedValue({
        entity: worldEntity(),
        outgoing: [],
        incoming: [edge(WARDENS, 'controls', 'incoming'), edge(storm, 'appears_in', 'incoming')],
      });

      renderWorkspace();
      await screen.findByText('Major Factions');
      openTab('Relationships');

      await screen.findByText('Held by');
      expect(screen.getByRole('button', { name: 'Open The Wardens' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'Open Radiation storms' })).toBeDefined();
    });

    it('names an unclaimed place as the finding rather than showing a blank panel', async () => {
      renderWorkspace();
      await screen.findByText('Major Factions');
      openTab('Relationships');

      await screen.findByText(/Nobody holds this/);
      expect(screen.getByText(/Nothing appears here/)).toBeDefined();
    });

    it('has nothing to read the world from until the project has a place', async () => {
      vi.mocked(api.listEntities).mockResolvedValue(page([WARDENS]));

      renderWorkspace();
      await screen.findByText('Major Factions');
      openTab('Relationships');

      await screen.findByText('No places to read the world from');
    });

    it('shows an archived neighbour as archived rather than hiding the edge', async () => {
      const lost = worldEntity({
        id: 'ent_lost',
        type: 'location',
        name: 'Cinder Field',
        status: 'archived',
        archivedAt: new Date(),
      });
      vi.mocked(api.getEntityNeighborhood).mockResolvedValue({
        entity: worldEntity(),
        outgoing: [edge(lost, 'contains', 'outgoing')],
        incoming: [],
      });

      renderWorkspace();
      await screen.findByText('Major Factions');
      openTab('Relationships');

      const row = await screen.findByRole('button', { name: 'Open Cinder Field' });
      expect(within(row).getByText('Archived')).toBeDefined();
    });

    it('walks the graph: opening a neighbouring place re-reads the question there', async () => {
      const veyl = worldEntity({ id: 'ent_veyl', type: 'location', name: 'Veyl Station' });
      vi.mocked(api.listEntities).mockResolvedValue(page([worldEntity(), veyl]));
      vi.mocked(api.getEntity).mockImplementation((_projectId, entityId) =>
        Promise.resolve(entityId === veyl.id ? veyl : worldEntity()),
      );
      vi.mocked(api.getEntityNeighborhood).mockResolvedValue({
        entity: worldEntity(),
        outgoing: [edge(veyl, 'contains', 'outgoing')],
        incoming: [],
      });

      renderWorkspace();
      await screen.findByText('Major Factions');
      openTab('Relationships');

      fireEvent.click(await screen.findByRole('button', { name: 'Open Veyl Station' }));

      await waitFor(() =>
        expect(screen.getByRole('combobox', { name: 'Place' })).toHaveProperty('value', veyl.id),
      );
      expect(screen.getByRole('tab', { name: 'Relationships' }).getAttribute('aria-selected')).toBe(
        'true',
      );
    });

    it('says why the graph could not be read, with a way to try again', async () => {
      vi.mocked(api.getEntityNeighborhood).mockRejectedValue(new Error('Graph unavailable'));

      renderWorkspace();
      await screen.findByText('Major Factions');
      openTab('Relationships');

      await screen.findByText('Graph unavailable');
      expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0);
    });
  });

  it('creates a world entity of the kind the dashboard panel asked for', async () => {
    vi.mocked(api.createEntity).mockResolvedValue(WARDENS);

    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Create a faction' }));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'The Wardens' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create faction' }));

    await waitFor(() => expect(api.createEntity).toHaveBeenCalledOnce());
    expect(vi.mocked(api.createEntity).mock.calls[0]![1]).toMatchObject({
      type: 'faction',
      name: 'The Wardens',
      data: { canonStatus: 'proposed' },
    });
  });
});
