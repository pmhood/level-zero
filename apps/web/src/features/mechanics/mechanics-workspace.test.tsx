// @vitest-environment jsdom
import type { Entity, EntityPage } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MechanicsWorkspace } from './mechanics-workspace';

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

function mechanic(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_oxygen',
    projectId: 'prj_1',
    type: 'mechanic',
    name: 'Oxygen management',
    description: 'Life is a resource.',
    status: 'active',
    tags: [],
    data: {
      area: 'resources',
      fantasy: 'Air is running out.',
      rules: ['Oxygen drains faster while sprinting'],
      inputs: [],
      outputs: [],
      implementationStatus: 'prototyped',
      keepMe: 'a field this workspace does not own',
    },
    currentVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    ...overrides,
  };
}

function page(items: Entity[]): EntityPage {
  return { items, total: items.length };
}

/** The list column, so a query does not also see the composer in the inspector. */
function browser() {
  return within(screen.getByRole('region', { name: 'Mechanics' }));
}

/** The centre column, likewise: both it and the composer have a "Name" field. */
function detail() {
  return screen.findByRole('region', { name: 'Mechanic detail' });
}

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MechanicsWorkspace projectId="prj_1" />
    </QueryClientProvider>,
  );
}

describe('Mechanics workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listEntities).mockResolvedValue(page([]));
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue({
      entity: mechanic(),
      outgoing: [],
      incoming: [],
    });
  });

  // Vitest globals are off in this workspace, so RTL's own auto-cleanup never
  // registers itself.
  afterEach(cleanup);

  it('shows a skeleton list rather than an empty one while the first page loads', () => {
    vi.mocked(api.listEntities).mockReturnValue(new Promise(() => {}));

    renderWorkspace();

    expect(screen.getByRole('status', { name: 'Loading mechanics' })).toBeDefined();
    expect(screen.queryByText('No mechanics yet')).toBeNull();
  });

  it('says what went wrong and offers a retry when the listing fails', async () => {
    vi.mocked(api.listEntities).mockRejectedValue(new Error('Service unavailable'));

    renderWorkspace();

    await screen.findByText("Couldn't load mechanics");
    expect(screen.getByText('Service unavailable')).toBeDefined();

    vi.mocked(api.listEntities).mockResolvedValue(page([mechanic()]));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('Oxygen management');
  });

  it('invites a first mechanic when the project has none', async () => {
    renderWorkspace();

    await screen.findByText('No mechanics yet');
    expect(browser().getByRole('button', { name: 'Create mechanic' })).toBeDefined();
  });

  it('tells a fruitless search apart from an empty project', async () => {
    vi.mocked(api.listEntities).mockResolvedValue(page([]));

    renderWorkspace();
    await screen.findByText('No mechanics yet');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search mechanics' }), {
      target: { value: 'economy' },
    });

    await screen.findByText('No mechanics match these filters');
  });

  it('has its own empty state for the archived shelf', async () => {
    renderWorkspace();
    await screen.findByText('No mechanics yet');

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by lifecycle' }), {
      target: { value: 'archived' },
    });

    await screen.findByText('No archived mechanics');
  });

  it('narrows the list by area, which the listing endpoint cannot filter on', async () => {
    vi.mocked(api.listEntities).mockResolvedValue(
      page([
        mechanic(),
        mechanic({ id: 'ent_trade', name: 'Trade routes', data: { area: 'economy' } }),
      ]),
    );

    renderWorkspace();
    await screen.findByText('Trade routes');

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by area' }), {
      target: { value: 'economy' },
    });

    await waitFor(() => expect(screen.queryByText('Oxygen management')).toBeNull());
    expect(screen.getByText('Trade routes')).toBeDefined();
  });

  it('opens the detail surface on the mechanic that was picked', async () => {
    vi.mocked(api.listEntities).mockResolvedValue(page([mechanic()]));
    vi.mocked(api.getEntity).mockResolvedValue(mechanic());
    vi.mocked(api.getEntityHistory).mockResolvedValue({
      entityId: 'ent_oxygen',
      currentVersionId: null,
      branches: [],
      versions: [],
      total: 0,
    });

    renderWorkspace();
    fireEvent.click(await screen.findByText('Oxygen management'));

    const surface = within(await detail());
    expect(surface.getByLabelText('Name')).toHaveProperty('value', 'Oxygen management');

    fireEvent.click(surface.getByRole('tab', { name: 'Rules & I/O' }));
    expect(surface.getByLabelText('Rules 1')).toHaveProperty(
      'value',
      'Oxygen drains faster while sprinting',
    );
  });

  it('saves structured edits without dropping the data it does not own', async () => {
    vi.mocked(api.listEntities).mockResolvedValue(page([mechanic()]));
    vi.mocked(api.getEntity).mockResolvedValue(mechanic());
    vi.mocked(api.updateEntity).mockResolvedValue(mechanic());

    renderWorkspace();
    fireEvent.click(await screen.findByText('Oxygen management'));

    const surface = within(await detail());
    fireEvent.change(surface.getByLabelText('Implementation'), {
      target: { value: 'implemented' },
    });
    fireEvent.click(surface.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.updateEntity).toHaveBeenCalledOnce());
    const [, entityId, patch] = vi.mocked(api.updateEntity).mock.calls[0]!;
    expect(entityId).toBe('ent_oxygen');
    expect(patch.data?.implementationStatus).toBe('implemented');
    expect(patch.data?.rules).toEqual(['Oxygen drains faster while sprinting']);
    expect(patch.data?.keepMe).toBe('a field this workspace does not own');
  });

  it('locks an archived mechanic and offers to restore it instead', async () => {
    const archived = mechanic({ status: 'archived', archivedAt: new Date() });
    vi.mocked(api.listEntities).mockResolvedValue(page([archived]));
    vi.mocked(api.getEntity).mockResolvedValue(archived);

    renderWorkspace();
    fireEvent.click(await screen.findByText('Oxygen management'));

    await screen.findByText(
      'Restore this mechanic before editing it. Its links and history are intact.',
    );
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
  });
});
