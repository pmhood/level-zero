// @vitest-environment jsdom
import type { Entity, EntityPage } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetLibraryToolbar } from './asset-library-toolbar';
import { DEFAULT_ASSET_LIBRARY_FILTERS, type AssetLibraryFilters } from './asset-library-filters';

vi.mock('@/lib/api', () => ({
  listEntities: vi.fn(),
  getEntity: vi.fn(),
}));

const api = await import('@/lib/api');

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_kael',
    projectId: 'prj_1',
    type: 'character',
    name: 'Kael Voss',
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

function entityPage(items: Entity[]): EntityPage {
  return { items, total: items.length };
}

function renderToolbar(overrides: Partial<AssetLibraryFilters> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const setFilter = vi.fn();
  const clearFilter = vi.fn();
  const clearAll = vi.fn();

  const view = render(
    <QueryClientProvider client={queryClient}>
      <AssetLibraryToolbar
        projectId="prj_1"
        filters={{ ...DEFAULT_ASSET_LIBRARY_FILTERS, ...overrides }}
        setFilter={setFilter}
        clearFilter={clearFilter}
        clearAll={clearAll}
        viewSwitcher={<div>View switcher</div>}
      />
    </QueryClientProvider>,
  );

  return { ...view, setFilter, clearFilter, clearAll };
}

describe('AssetLibraryToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listEntities).mockResolvedValue(entityPage([]));
    vi.mocked(api.getEntity).mockResolvedValue(entity());
  });

  afterEach(cleanup);

  it('debounces the search field instead of setting the filter on every keystroke', async () => {
    const { setFilter } = renderToolbar();
    const field = screen.getByRole('searchbox', { name: 'Search assets by filename' });

    fireEvent.change(field, { target: { value: 'k' } });
    fireEvent.change(field, { target: { value: 'ka' } });
    fireEvent.change(field, { target: { value: 'kael' } });

    expect(setFilter).not.toHaveBeenCalled();

    await waitFor(() => expect(setFilter).toHaveBeenCalledWith('search', 'kael'));
    expect(setFilter).toHaveBeenCalledTimes(1);
  });

  it('sets the kind filter from the type dropdown', () => {
    const { setFilter } = renderToolbar();

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'image' } });

    expect(setFilter).toHaveBeenCalledWith('kind', 'image');
  });

  it('sets the origin filter from the origin dropdown', () => {
    const { setFilter } = renderToolbar();

    fireEvent.change(screen.getByLabelText('Origin'), { target: { value: 'generated' } });

    expect(setFilter).toHaveBeenCalledWith('origin', 'generated');
  });

  it('sets the sort field from the sort dropdown', () => {
    const { setFilter } = renderToolbar();

    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'filename' } });

    expect(setFilter).toHaveBeenCalledWith('sort', 'filename');
  });

  it('sets the MIME family, mark and selection filters', () => {
    const { setFilter } = renderToolbar();

    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'audio' } });
    expect(setFilter).toHaveBeenCalledWith('mimeFamily', 'audio');

    fireEvent.change(screen.getByLabelText('Marked'), { target: { value: 'favorite' } });
    expect(setFilter).toHaveBeenCalledWith('markKind', 'favorite');

    fireEvent.change(screen.getByLabelText('Selection'), { target: { value: 'approved' } });
    expect(setFilter).toHaveBeenCalledWith('selectionState', 'approved');
  });

  it('sets the created-date range from the two date fields', () => {
    const { setFilter } = renderToolbar();

    fireEvent.change(screen.getByLabelText('Created after'), { target: { value: '2026-01-01' } });
    expect(setFilter).toHaveBeenCalledWith('createdAfter', '2026-01-01');

    fireEvent.change(screen.getByLabelText('Created before'), { target: { value: '2026-02-01' } });
    expect(setFilter).toHaveBeenCalledWith('createdBefore', '2026-02-01');
  });

  it('toggles includeArchived from the checkbox', () => {
    const { setFilter } = renderToolbar();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Include archived' }));

    expect(setFilter).toHaveBeenCalledWith('includeArchived', true);
  });

  it('sets the collection filter from the collection dropdown', async () => {
    vi.mocked(api.listEntities).mockImplementation((_projectId, params) =>
      Promise.resolve(
        params?.type?.includes('asset_collection')
          ? entityPage([
              entity({ id: 'col_props', type: 'asset_collection', name: 'Props & Gear' }),
            ])
          : entityPage([]),
      ),
    );
    const { setFilter } = renderToolbar();

    const select = await screen.findByLabelText('Collection');
    await screen.findByRole('option', { name: 'Props & Gear' });
    fireEvent.change(select, { target: { value: 'col_props' } });

    expect(setFilter).toHaveBeenCalledWith('collectionId', 'col_props');
  });

  it('shows the collection chip by name, resolved from the same fetched list', async () => {
    vi.mocked(api.listEntities).mockImplementation((_projectId, params) =>
      Promise.resolve(
        params?.type?.includes('asset_collection')
          ? entityPage([
              entity({ id: 'col_props', type: 'asset_collection', name: 'Props & Gear' }),
            ])
          : entityPage([]),
      ),
    );
    const { clearFilter } = renderToolbar({ collectionId: 'col_props' });

    const chip = await screen.findByRole('button', { name: 'Remove tag Collection: Props & Gear' });
    fireEvent.click(chip);

    expect(clearFilter).toHaveBeenCalledWith('collectionId');
  });

  it('picks a linked entity from the search results', async () => {
    // Discriminated by type: the toolbar's own Collection select (#228) calls
    // the same `listEntities`, and would otherwise pick up this fixture too
    // and offer it as a same-named, same-`id` option.
    vi.mocked(api.listEntities).mockImplementation((_projectId, params) =>
      Promise.resolve(
        params?.type?.includes('asset_collection') ? entityPage([]) : entityPage([entity()]),
      ),
    );
    const { setFilter } = renderToolbar();

    const field = screen.getByLabelText('Linked entity');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'Kael' } });

    const option = await screen.findByRole('option', { name: /Kael Voss/ });
    fireEvent.click(option);

    expect(setFilter).toHaveBeenCalledWith('linkedEntityId', 'ent_kael');
  });

  it('shows no chips and no clear-all for the default, unfiltered view', () => {
    renderToolbar();

    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
  });

  it('shows a removable chip per active filter, and clears just that one', () => {
    const { clearFilter } = renderToolbar({ kind: 'image', origin: 'generated' });

    expect(screen.getByRole('button', { name: 'Remove tag Type: Image' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Remove tag Generated' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Remove tag Type: Image' }));

    expect(clearFilter).toHaveBeenCalledWith('kind');
  });

  it('clears every active filter from Clear all', () => {
    const { clearAll } = renderToolbar({ kind: 'image', includeArchived: true });

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(clearAll).toHaveBeenCalled();
  });
});
