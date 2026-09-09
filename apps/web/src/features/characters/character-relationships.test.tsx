// @vitest-environment jsdom
import type { Entity, EntityNeighborhood, NeighborEdge, RelationType } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CharacterRelationships } from './character-relationships';

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

function edge(
  target: Entity,
  relation: RelationType,
  overrides: Partial<NeighborEdge> = {},
): NeighborEdge {
  return {
    relationship: {
      id: `rel_${target.id}`,
      projectId: 'prj_1',
      sourceEntityId: 'ent_kael',
      targetEntityId: target.id,
      relation,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    direction: 'outgoing',
    entity: target,
    ...overrides,
  };
}

function neighborhood(outgoing: NeighborEdge[] = [], incoming: NeighborEdge[] = []) {
  return { entity: entity(), outgoing, incoming } satisfies EntityNeighborhood;
}

const DOCKERS = entity({ id: 'ent_dockers', type: 'faction', name: 'The Dockers' });
const SHELF = entity({ id: 'ent_shelf', type: 'location', name: 'The Shelf' });

function renderRelationships(subject: Entity = entity()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CharacterRelationships projectId="prj_1" character={subject} />
    </QueryClientProvider>,
  );
}

describe('Character relationships', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(neighborhood());
    vi.mocked(api.listEntities).mockResolvedValue({ items: [DOCKERS, SHELF], total: 2 });
  });

  afterEach(cleanup);

  it('waits for the graph rather than claiming the character is unconnected', () => {
    vi.mocked(api.getEntityNeighborhood).mockReturnValue(new Promise(() => {}));

    renderRelationships();

    expect(screen.getByText('Loading relationships…')).toBeDefined();
  });

  it('says what went wrong when the graph cannot be read', async () => {
    vi.mocked(api.getEntityNeighborhood).mockRejectedValue(new Error('Service unavailable'));

    renderRelationships();

    await screen.findByText('Service unavailable');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
  });

  it('invites a first link when nothing is connected', async () => {
    renderRelationships();

    await screen.findByText('Nothing linked yet');
  });

  it('shows the factions and locations a character is bound to, both ways round', async () => {
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood(
        [edge(DOCKERS, 'belongs_to')],
        [edge(SHELF, 'contains', { direction: 'incoming' })],
      ),
    );

    renderRelationships();

    await screen.findByText('The Dockers');
    expect(screen.getByText('Belongs to · Faction')).toBeDefined();
    expect(screen.getByText('Contains by · Location')).toBeDefined();
  });

  it('leaves the visuals to their own tab', async () => {
    const portrait = entity({ id: 'ent_ref', type: 'asset_reference', name: 'kael.png' });
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood([edge(DOCKERS, 'belongs_to'), edge(portrait, 'references')]),
    );

    renderRelationships();

    await screen.findByText('The Dockers');
    expect(screen.queryByText('kael.png')).toBeNull();
  });

  it('marks an edge to something archived instead of dropping it', async () => {
    const gone = entity({ ...DOCKERS, status: 'archived', archivedAt: new Date() });
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood([edge(gone, 'belongs_to')]),
    );

    renderRelationships();

    await screen.findByText('The Dockers');
    expect(screen.getByText('Archived')).toBeDefined();
  });

  it('links to an entity that already exists rather than making a second copy of it', async () => {
    vi.mocked(api.createRelationship).mockResolvedValue(edge(DOCKERS, 'belongs_to').relationship);

    renderRelationships();
    await screen.findByRole('option', { name: 'The Dockers · Faction' });

    fireEvent.change(screen.getByRole('combobox', { name: 'Entity to link' }), {
      target: { value: 'ent_dockers' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));

    await waitFor(() => expect(api.createRelationship).toHaveBeenCalledOnce());
    expect(vi.mocked(api.createRelationship).mock.calls[0]![2]).toEqual({
      targetEntityId: 'ent_dockers',
      relation: 'belongs_to',
    });
  });

  it('removes an edge without touching what it pointed at', async () => {
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood([edge(DOCKERS, 'belongs_to')]),
    );
    vi.mocked(api.deleteRelationship).mockResolvedValue(undefined);

    renderRelationships();
    fireEvent.click(await screen.findByRole('button', { name: 'Unlink' }));

    await waitFor(() => expect(api.deleteRelationship).toHaveBeenCalledOnce());
    expect(vi.mocked(api.deleteRelationship).mock.calls[0]).toEqual([
      'prj_1',
      'ent_kael',
      'rel_ent_dockers',
    ]);
  });

  it('never offers to unlink lineage, which the API refuses anyway', async () => {
    const idea = entity({ id: 'ent_idea', type: 'idea', name: 'A salvager who remembers' });
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood([edge(idea, 'promoted_to')]),
    );

    renderRelationships();

    await screen.findByText('A salvager who remembers');
    expect(screen.queryByRole('button', { name: 'Unlink' })).toBeNull();
  });

  it('will not change the graph around an archived character', async () => {
    renderRelationships(entity({ status: 'archived', archivedAt: new Date() }));

    await screen.findByText('Nothing linked yet');
    expect(screen.queryByRole('combobox', { name: 'Entity to link' })).toBeNull();
  });
});
