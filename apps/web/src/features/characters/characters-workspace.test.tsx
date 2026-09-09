// @vitest-environment jsdom
import type { Entity, EntityPage } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CharactersWorkspace } from './characters-workspace';

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  assetContentUrl: (projectId: string, assetId: string) => `/assets/${projectId}/${assetId}`,
  listEntities: vi.fn(),
  listAssets: vi.fn(),
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

function character(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_kael',
    projectId: 'prj_1',
    type: 'character',
    name: 'Kael Voss',
    description: 'Salvages what the flood left.',
    status: 'active',
    tags: ['crew'],
    data: {
      role: 'Salvager',
      quote: 'The ocean takes, but it also gives back.',
      traits: ['Wary'],
      motivation: 'Recover what the flood took.',
      inventory: [{ name: 'Cutting torch', note: "Her father's." }],
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
  return within(screen.getByRole('region', { name: 'Characters' }));
}

/** The centre column, likewise: both it and the composer have a "Name" field. */
function detail() {
  return screen.findByRole('region', { name: 'Character detail' });
}

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CharactersWorkspace projectId="prj_1" />
    </QueryClientProvider>,
  );
}

describe('Characters workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listEntities).mockResolvedValue(page([]));
    vi.mocked(api.listAssets).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue({
      entity: character(),
      outgoing: [],
      incoming: [],
    });
    vi.mocked(api.getEntityHistory).mockResolvedValue({
      entityId: 'ent_kael',
      currentVersionId: null,
      branches: [],
      versions: [],
      total: 0,
    });
  });

  // Vitest globals are off in this workspace, so RTL's own auto-cleanup never
  // registers itself.
  afterEach(cleanup);

  it('shows a skeleton list rather than an empty one while the first page loads', () => {
    vi.mocked(api.listEntities).mockReturnValue(new Promise(() => {}));

    renderWorkspace();

    expect(screen.getByRole('status', { name: 'Loading characters' })).toBeDefined();
    expect(screen.queryByText('No characters yet')).toBeNull();
  });

  it('says what went wrong and offers a retry when the listing fails', async () => {
    vi.mocked(api.listEntities).mockRejectedValue(new Error('Service unavailable'));

    renderWorkspace();

    await screen.findByText("Couldn't load characters");
    expect(screen.getByText('Service unavailable')).toBeDefined();

    vi.mocked(api.listEntities).mockResolvedValue(page([character()]));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('Kael Voss');
  });

  it('invites a first character when the project has none', async () => {
    renderWorkspace();

    await screen.findByText('No characters yet');
    expect(browser().getByRole('button', { name: 'Create character' })).toBeDefined();
  });

  it('tells a fruitless search apart from an empty project', async () => {
    renderWorkspace();
    await screen.findByText('No characters yet');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search characters' }), {
      target: { value: 'broker' },
    });

    await screen.findByText('No characters match these filters');
  });

  it('has its own empty state for the archived shelf', async () => {
    renderWorkspace();
    await screen.findByText('No characters yet');

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by status' }), {
      target: { value: 'archived' },
    });

    await screen.findByText('No archived characters');
  });

  it('narrows the list by role, which the listing endpoint cannot filter on', async () => {
    vi.mocked(api.listEntities).mockResolvedValue(
      page([
        character(),
        character({ id: 'ent_orin', name: 'Orin Vale', data: { role: 'Broker' } }),
      ]),
    );

    renderWorkspace();
    await screen.findByText('Orin Vale');

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by role' }), {
      target: { value: 'Broker' },
    });

    await waitFor(() => expect(screen.queryByText('Kael Voss')).toBeNull());
    expect(screen.getByText('Orin Vale')).toBeDefined();
  });

  it('narrows the list by tag', async () => {
    vi.mocked(api.listEntities).mockResolvedValue(
      page([character(), character({ id: 'ent_orin', name: 'Orin Vale', tags: ['antagonist'] })]),
    );

    renderWorkspace();
    await screen.findByText('Orin Vale');

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by tag' }), {
      target: { value: 'antagonist' },
    });

    await waitFor(() => expect(screen.queryByText('Kael Voss')).toBeNull());
  });

  it('opens the detail surface on the character that was picked', async () => {
    vi.mocked(api.listEntities).mockResolvedValue(page([character()]));
    vi.mocked(api.getEntity).mockResolvedValue(character());

    renderWorkspace();
    fireEvent.click(await screen.findByText('Kael Voss'));

    const surface = within(await detail());
    expect(surface.getByLabelText('Name')).toHaveProperty('value', 'Kael Voss');
    expect(surface.getByLabelText('Role')).toHaveProperty('value', 'Salvager');
  });

  it('gives every section the spec names its own tab', async () => {
    vi.mocked(api.listEntities).mockResolvedValue(page([character()]));
    vi.mocked(api.getEntity).mockResolvedValue(character());

    renderWorkspace();
    fireEvent.click(await screen.findByText('Kael Voss'));

    const surface = within(await detail());
    for (const label of [
      'Overview',
      'Visuals',
      'Background',
      'Inventory',
      'Relationships',
      'Notes',
    ]) {
      expect(surface.getByRole('tab', { name: label })).toBeDefined();
    }
  });

  it('edits what a character carries on the inventory tab', async () => {
    vi.mocked(api.listEntities).mockResolvedValue(page([character()]));
    vi.mocked(api.getEntity).mockResolvedValue(character());
    vi.mocked(api.updateEntity).mockResolvedValue(character());

    renderWorkspace();
    fireEvent.click(await screen.findByText('Kael Voss'));

    const surface = within(await detail());
    fireEvent.click(surface.getByRole('tab', { name: 'Inventory' }));
    expect(surface.getByLabelText('Item 1 name')).toHaveProperty('value', 'Cutting torch');

    fireEvent.change(surface.getByLabelText('Item 1 note'), { target: { value: 'Runs hot.' } });
    fireEvent.click(surface.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.updateEntity).toHaveBeenCalledOnce());
    const [, , patch] = vi.mocked(api.updateEntity).mock.calls[0]!;
    expect(patch.data?.inventory).toEqual([{ name: 'Cutting torch', note: 'Runs hot.' }]);
  });

  it('saves structured edits without dropping the data it does not own', async () => {
    vi.mocked(api.listEntities).mockResolvedValue(page([character()]));
    vi.mocked(api.getEntity).mockResolvedValue(character());
    vi.mocked(api.updateEntity).mockResolvedValue(character());

    renderWorkspace();
    fireEvent.click(await screen.findByText('Kael Voss'));

    const surface = within(await detail());
    fireEvent.change(surface.getByLabelText('Role'), { target: { value: 'Broker' } });
    fireEvent.click(surface.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.updateEntity).toHaveBeenCalledOnce());
    const [, entityId, patch] = vi.mocked(api.updateEntity).mock.calls[0]!;
    expect(entityId).toBe('ent_kael');
    expect(patch.data?.role).toBe('Broker');
    expect(patch.data?.inventory).toEqual([{ name: 'Cutting torch', note: "Her father's." }]);
    expect(patch.data?.keepMe).toBe('a field this workspace does not own');
  });

  it('locks an archived character and offers to restore it instead', async () => {
    const archived = character({ status: 'archived', archivedAt: new Date() });
    vi.mocked(api.listEntities).mockResolvedValue(page([archived]));
    vi.mocked(api.getEntity).mockResolvedValue(archived);

    renderWorkspace();
    fireEvent.click(await screen.findByText('Kael Voss'));

    await screen.findByText(
      'Restore this character before editing it. Its visuals, relationships and history are intact.',
    );
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
  });

  it('creates a character from the inspector and selects it', async () => {
    const created = character({ id: 'ent_new', name: 'Mara Kell' });
    vi.mocked(api.createEntity).mockResolvedValue(created);
    vi.mocked(api.getEntity).mockResolvedValue(created);

    renderWorkspace();
    await screen.findByText('No characters yet');

    const composer = within(screen.getByRole('complementary'));
    fireEvent.change(composer.getByLabelText('Name'), { target: { value: 'Mara Kell' } });
    fireEvent.click(composer.getByRole('button', { name: 'Create character' }));

    await waitFor(() => expect(api.createEntity).toHaveBeenCalledOnce());
    expect(vi.mocked(api.createEntity).mock.calls[0]![1]).toMatchObject({ type: 'character' });
    await detail();
  });
});
