// @vitest-environment jsdom
import type { Entity, EntityNeighborhood, NeighborEdge } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CoreLoopView } from './core-loop-view';

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  getEntity: vi.fn(),
  getEntityNeighborhood: vi.fn(),
  updateEntity: vi.fn(),
  createRelationship: vi.fn(),
  deleteRelationship: vi.fn(),
  archiveEntity: vi.fn(),
  listEntities: vi.fn(),
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

const EXPLORE = entity('ent_explore', 'Explore');
const SCAVENGE = entity('ent_scavenge', 'Scavenge');
const UPGRADE = entity('ent_upgrade', 'Upgrade');

const LOOP = entity('loop_1', 'Dive loop', {
  type: 'system',
  data: { area: 'core_loop', stepOrder: ['ent_explore', 'ent_scavenge', 'ent_upgrade'] },
});

function contains(id: string, target: Entity): NeighborEdge {
  return {
    direction: 'outgoing',
    entity: target,
    relationship: {
      id,
      projectId: 'prj_1',
      sourceEntityId: LOOP.id,
      targetEntityId: target.id,
      relation: 'contains',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

function neighborhood(outgoing: NeighborEdge[]): EntityNeighborhood {
  return { entity: LOOP, outgoing, incoming: [] };
}

function renderLoop(loops: Entity[] = [LOOP], candidates: Entity[] = [EXPLORE, SCAVENGE, UPGRADE]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CoreLoopView
        projectId="prj_1"
        loops={loops}
        candidates={candidates}
        selectedId={null}
        onSelect={() => {}}
      />
    </QueryClientProvider>,
  );
}

function stepNames(): string[] {
  return screen.getAllByRole('listitem').map((item) => item.querySelector('p')?.textContent ?? '');
}

describe('core loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getEntity).mockResolvedValue(LOOP);
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood([
        contains('rel_1', EXPLORE),
        contains('rel_2', SCAVENGE),
        contains('rel_3', UPGRADE),
      ]),
    );
    vi.mocked(api.updateEntity).mockResolvedValue(LOOP);
    vi.mocked(api.deleteRelationship).mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it('asks for a system before it can draw a loop', () => {
    renderLoop([]);

    expect(screen.getByText('No systems to loop yet')).toBeDefined();
  });

  it('walks the mechanics the loop contains, in the order the loop stores', async () => {
    renderLoop();

    await screen.findByRole('button', { name: 'Open Explore' });
    expect(stepNames()).toEqual(['Explore', 'Scavenge', 'Upgrade']);
    // The loop closes: the last step leads back to the first.
    expect(screen.getByText('Explore', { selector: 'span' })).toBeDefined();
  });

  it('reorders by writing the loop entity, never by touching a step', async () => {
    renderLoop();
    await screen.findByRole('button', { name: 'Open Explore' });

    fireEvent.click(screen.getByRole('button', { name: 'Move Explore later' }));

    await waitFor(() => expect(api.updateEntity).toHaveBeenCalledOnce());
    const [, entityId, patch] = vi.mocked(api.updateEntity).mock.calls[0]!;
    expect(entityId).toBe('loop_1');
    expect(patch.data?.stepOrder).toEqual(['ent_scavenge', 'ent_explore', 'ent_upgrade']);
    // The loop's own fields survive, because the API replaces `data` wholesale.
    expect(patch.data?.area).toBe('core_loop');
  });

  it('will not move the first step earlier or the last step later', async () => {
    renderLoop();
    await screen.findByRole('button', { name: 'Open Explore' });

    expect(screen.getByRole('button', { name: 'Move Explore earlier' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: 'Move Upgrade later' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('removes a step by unlinking the edge, leaving the mechanic alone', async () => {
    renderLoop();
    await screen.findByRole('button', { name: 'Open Scavenge' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Scavenge from the loop' }));

    await waitFor(() => expect(api.deleteRelationship).toHaveBeenCalledOnce());
    expect(api.deleteRelationship).toHaveBeenCalledWith('prj_1', 'loop_1', 'rel_2');
    expect(api.archiveEntity).not.toHaveBeenCalled();
  });

  it('adds a step as a `contains` edge plus its place in the order', async () => {
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood([contains('rel_1', EXPLORE)]),
    );
    vi.mocked(api.createRelationship).mockResolvedValue({
      id: 'rel_new',
      projectId: 'prj_1',
      sourceEntityId: 'loop_1',
      targetEntityId: 'ent_scavenge',
      relation: 'contains',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    renderLoop();
    await screen.findByRole('button', { name: 'Open Explore' });

    fireEvent.change(screen.getByRole('combobox', { name: 'Mechanic to add to the loop' }), {
      target: { value: 'ent_scavenge' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));

    await waitFor(() => expect(api.createRelationship).toHaveBeenCalledOnce());
    expect(api.createRelationship).toHaveBeenCalledWith('prj_1', 'loop_1', {
      targetEntityId: 'ent_scavenge',
      relation: 'contains',
    });

    await waitFor(() => expect(api.updateEntity).toHaveBeenCalledOnce());
    expect(vi.mocked(api.updateEntity).mock.calls[0]![2].data?.stepOrder).toEqual([
      'ent_explore',
      'ent_scavenge',
    ]);
  });

  it('does not offer a mechanic that is already a step', async () => {
    renderLoop();
    await screen.findByRole('button', { name: 'Open Explore' });

    const options = screen.getByRole('combobox', { name: 'Mechanic to add to the loop' });
    expect(options.textContent).toBe('Choose a mechanic…');
  });

  it('keeps an archived step visible rather than leaving a gap in the loop', async () => {
    const archived = entity('ent_scavenge', 'Scavenge', { status: 'archived' });
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood([contains('rel_1', EXPLORE), contains('rel_2', archived)]),
    );

    renderLoop();

    await screen.findByRole('button', { name: 'Open Scavenge' });
    expect(stepNames()).toEqual(['Explore', 'Scavenge']);
    expect(screen.getByText('Archived')).toBeDefined();
  });

  it('drops a step whose edge is gone, without waiting for the order to catch up', async () => {
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood([contains('rel_1', EXPLORE), contains('rel_3', UPGRADE)]),
    );

    renderLoop();

    await screen.findByRole('button', { name: 'Open Explore' });
    expect(stepNames()).toEqual(['Explore', 'Upgrade']);
  });

  it('says a loop with no steps yet is empty, not broken', async () => {
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(neighborhood([]));

    renderLoop();

    await screen.findByText('This loop has no steps yet');
  });

  it('reports a failure to load the loop and offers a retry', async () => {
    vi.mocked(api.getEntityNeighborhood).mockRejectedValue(new Error('Service unavailable'));

    renderLoop();

    await screen.findByText('Service unavailable');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
  });
});
