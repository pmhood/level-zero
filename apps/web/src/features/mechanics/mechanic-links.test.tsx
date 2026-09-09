// @vitest-environment jsdom
import type { Entity, EntityNeighborhood, NeighborEdge, RelationType } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MechanicLinks } from './mechanic-links';

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  listEntities: vi.fn(),
  getEntityNeighborhood: vi.fn(),
  createRelationship: vi.fn(),
  deleteRelationship: vi.fn(),
}));

const api = await import('@/lib/api');

function entity(id: string, name: string, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    projectId: 'prj_1',
    type: 'mechanic',
    name,
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

const OXYGEN = entity('ent_oxygen', 'Oxygen management');
const SCAVENGE = entity('ent_scavenge', 'Scavenging');
const IDEA = entity('ent_idea', 'Drowned world', { type: 'idea' });

function edge(
  id: string,
  target: Entity,
  relation: RelationType,
  direction: 'outgoing' | 'incoming' = 'outgoing',
): NeighborEdge {
  return {
    direction,
    entity: target,
    relationship: {
      id,
      projectId: 'prj_1',
      sourceEntityId: direction === 'outgoing' ? OXYGEN.id : target.id,
      targetEntityId: direction === 'outgoing' ? target.id : OXYGEN.id,
      relation,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

function neighborhood(
  outgoing: NeighborEdge[] = [],
  incoming: NeighborEdge[] = [],
): EntityNeighborhood {
  return { entity: OXYGEN, outgoing, incoming };
}

function renderLinks(mechanic: Entity = OXYGEN) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MechanicLinks projectId="prj_1" mechanic={mechanic} />
    </QueryClientProvider>,
  );
}

describe('mechanic links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listEntities).mockResolvedValue({ items: [SCAVENGE], total: 1 });
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(neighborhood());
    vi.mocked(api.deleteRelationship).mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it('says nothing is linked yet rather than showing an empty list', async () => {
    renderLinks();

    await screen.findByText(/Nothing linked yet/);
  });

  it('reads every edge source-first, and turns an incoming one around', async () => {
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood(
        [edge('rel_1', SCAVENGE, 'depends_on')],
        [edge('rel_2', IDEA, 'promoted_to', 'incoming')],
      ),
    );

    renderLinks();

    await screen.findByText('Scavenging');
    expect(screen.getByText('Depends on · Mechanic')).toBeDefined();
    expect(screen.getByText('Promoted to by · Idea')).toBeDefined();
  });

  it('offers to unlink a structural edge this mechanic owns', async () => {
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood([edge('rel_1', SCAVENGE, 'depends_on')]),
    );

    renderLinks();
    fireEvent.click(await screen.findByRole('button', { name: 'Unlink' }));

    await waitFor(() => expect(api.deleteRelationship).toHaveBeenCalledOnce());
    expect(api.deleteRelationship).toHaveBeenCalledWith('prj_1', 'ent_oxygen', 'rel_1');
  });

  it('does not offer to unlink lineage, which records how something came to exist', async () => {
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood([edge('rel_1', SCAVENGE, 'derived_from')]),
    );

    renderLinks();

    await screen.findByText('Scavenging');
    expect(screen.queryByRole('button', { name: 'Unlink' })).toBeNull();
  });

  it('does not offer to unlink an edge that belongs to the entity at the other end', async () => {
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood([], [edge('rel_1', SCAVENGE, 'depends_on', 'incoming')]),
    );

    renderLinks();

    await screen.findByText('Scavenging');
    expect(screen.queryByRole('button', { name: 'Unlink' })).toBeNull();
  });

  it('writes a new edge from this mechanic outwards', async () => {
    renderLinks();
    // The picker is populated by its own query; wait for the option to exist.
    await screen.findByRole('option', { name: /Scavenging/ });

    fireEvent.change(screen.getByRole('combobox', { name: 'Relation' }), {
      target: { value: 'implements' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Entity to link' }), {
      target: { value: 'ent_scavenge' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));

    await waitFor(() => expect(api.createRelationship).toHaveBeenCalledOnce());
    expect(api.createRelationship).toHaveBeenCalledWith('prj_1', 'ent_oxygen', {
      targetEntityId: 'ent_scavenge',
      relation: 'implements',
    });
  });

  it('reports a rejected link instead of failing silently', async () => {
    vi.mocked(api.createRelationship).mockRejectedValue(
      new Error('That relationship already exists'),
    );

    renderLinks();
    await screen.findByRole('option', { name: /Scavenging/ });

    fireEvent.change(screen.getByRole('combobox', { name: 'Entity to link' }), {
      target: { value: 'ent_scavenge' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));

    await screen.findByText('That relationship already exists');
  });

  it('will not draw new links from an archived mechanic', async () => {
    renderLinks(entity('ent_oxygen', 'Oxygen management', { status: 'archived' }));

    await screen.findByText(/Nothing linked yet/);
    expect(screen.queryByRole('button', { name: 'Add link' })).toBeNull();
  });

  it('reports a failure to load the graph and offers a retry', async () => {
    vi.mocked(api.getEntityNeighborhood).mockRejectedValue(new Error('Service unavailable'));

    renderLinks();

    await screen.findByText('Service unavailable');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
  });
});
