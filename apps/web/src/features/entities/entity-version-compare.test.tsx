// @vitest-environment jsdom
import type { Entity, EntityHistory, EntitySnapshot, EntityVersion } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityVersionCompare } from './entity-version-compare';

vi.mock('@/lib/api', () => ({
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  getEntityHistory: vi.fn(),
  restoreEntityVersion: vi.fn(),
  branchEntityVersion: vi.fn(),
}));

const api = await import('@/lib/api');

const drain = (value: number) => ({
  id: 'oxygen-drain',
  label: 'Oxygen drain',
  type: 'range',
  value,
  min: 0,
  max: 240,
  step: 1,
  units: 's',
});

function mechanic(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_oxygen',
    projectId: 'prj_1',
    type: 'mechanic',
    name: 'Oxygen management',
    description: 'Life is a resource.',
    status: 'active',
    tags: [],
    data: { tuningParameters: [drain(60)] },
    currentVersionId: 'ver_3',
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    updatedAt: new Date('2026-03-01T09:00:00.000Z'),
    archivedAt: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<EntitySnapshot> = {}): EntitySnapshot {
  return {
    name: 'Oxygen management',
    description: 'Life is a resource.',
    status: 'active',
    tags: [],
    data: {},
    ...overrides,
  };
}

function version(
  id: string,
  versionNumber: number,
  overrides: Partial<EntityVersion> = {},
): EntityVersion {
  return {
    id,
    projectId: 'prj_1',
    entityId: 'ent_oxygen',
    versionNumber,
    parentVersionId: null,
    branchName: 'main',
    snapshot: snapshot(),
    reason: 'manual',
    metadata: {},
    createdBy: null,
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    ...overrides,
  };
}

/** Newest first, the order the history endpoint answers in. */
function history(versions: EntityVersion[], currentVersionId: string | null): EntityHistory {
  return {
    entityId: 'ent_oxygen',
    currentVersionId,
    branches: ['main'],
    versions,
    total: versions.length,
  };
}

const tuned = [
  version('ver_3', 3, { snapshot: snapshot({ data: { tuningParameters: [drain(60)] } }) }),
  version('ver_2', 2, { snapshot: snapshot({ data: { tuningParameters: [drain(90)] } }) }),
  version('ver_1', 1, { snapshot: snapshot({ data: { tuningParameters: [drain(120)] } }) }),
];

function renderCompare(entity: Entity = mechanic()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <EntityVersionCompare projectId="prj_1" entity={entity} />
    </QueryClientProvider>,
  );
}

function differences() {
  return within(screen.getByRole('region', { name: 'Differences' }));
}

describe('Entity version compare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getEntityHistory).mockResolvedValue(history(tuned, 'ver_3'));
  });

  afterEach(cleanup);

  it('opens on the two most recent versions, newest on the right', async () => {
    renderCompare();

    const a = (await screen.findByLabelText('A')) as HTMLSelectElement;
    const b = screen.getByLabelText('B') as HTMLSelectElement;

    expect(a.value).toBe('ver_2');
    expect(b.value).toBe('ver_3');
    expect(
      within(screen.getByRole('region', { name: 'Side B' })).getByText('Current'),
    ).toBeTruthy();
  });

  it('reads a tuning change as the values a designer typed', async () => {
    renderCompare();

    await screen.findByLabelText('A');
    expect(differences().getByText('Oxygen drain')).toBeTruthy();
    expect(differences().getByText('90 s')).toBeTruthy();
    expect(differences().getByText('60 s')).toBeTruthy();
  });

  it('compares whichever two versions are picked', async () => {
    renderCompare();

    fireEvent.change(await screen.findByLabelText('A'), { target: { value: 'ver_1' } });

    await waitFor(() => expect(differences().getByText('120 s')).toBeTruthy());
    expect(differences().queryByText('90 s')).toBeNull();
  });

  it('swaps the two sides without changing what it says', async () => {
    renderCompare();

    fireEvent.click(await screen.findByRole('button', { name: 'Swap sides' }));

    await waitFor(() =>
      expect((screen.getByLabelText('A') as HTMLSelectElement).value).toBe('ver_3'),
    );
    expect((screen.getByLabelText('B') as HTMLSelectElement).value).toBe('ver_2');
  });

  it('restores the side that is not current, and only that one', async () => {
    vi.mocked(api.restoreEntityVersion).mockResolvedValue(
      version('ver_4', 4, { reason: 'restore' }),
    );
    renderCompare();

    await screen.findByLabelText('A');
    const a = within(screen.getByRole('region', { name: 'Side A' }));
    fireEvent.click(a.getByRole('button', { name: 'Restore this version' }));

    await waitFor(() =>
      expect(api.restoreEntityVersion).toHaveBeenCalledWith('prj_1', 'ent_oxygen', 'ver_2'),
    );
    // The version that is already the working copy has nothing to restore to.
    expect(
      within(screen.getByRole('region', { name: 'Side B' })).queryByRole('button', {
        name: 'Restore this version',
      }),
    ).toBeNull();
  });

  it('starts a named line of work from the version it was asked from', async () => {
    vi.mocked(api.branchEntityVersion).mockResolvedValue(
      version('ver_4', 4, { reason: 'branch', branchName: 'gentler' }),
    );
    renderCompare();

    await screen.findByLabelText('A');
    const a = within(screen.getByRole('region', { name: 'Side A' }));
    fireEvent.click(a.getByRole('button', { name: 'Start a new line of work' }));

    fireEvent.change(await screen.findByLabelText(/Name this line of work/), {
      target: { value: 'Gentler' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() =>
      expect(api.branchEntityVersion).toHaveBeenCalledWith('prj_1', 'ent_oxygen', 'ver_2', {
        branchName: 'Gentler',
      }),
    );
  });

  it('changes nothing on its own', async () => {
    renderCompare();

    await screen.findByLabelText('A');

    expect(api.restoreEntityVersion).not.toHaveBeenCalled();
    expect(api.branchEntityVersion).not.toHaveBeenCalled();
  });

  it('still compares an archived entity, but offers it no actions', async () => {
    renderCompare(mechanic({ status: 'archived' }));

    await screen.findByLabelText('A');
    expect(differences().getByText('Oxygen drain')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Restore this version' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start a new line of work' })).toBeNull();
    expect(screen.getByText(/before changing its versions/)).toBeTruthy();
  });

  it('asks for a second version before it can compare anything', async () => {
    vi.mocked(api.getEntityHistory).mockResolvedValue(history([tuned[0]!], 'ver_3'));
    renderCompare();

    expect(await screen.findByText('Nothing to compare yet')).toBeTruthy();
  });

  it('reads a document version as the writing in it, never as its stored JSON', async () => {
    const body = (text: string) => ({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    vi.mocked(api.getEntityHistory).mockResolvedValue(
      history(
        [
          version('ver_2', 2, {
            snapshot: snapshot({ name: 'GDD', data: { content: body('Dive deeper, faster.') } }),
          }),
          version('ver_1', 1, {
            snapshot: snapshot({ name: 'GDD', data: { content: body('Dive deeper.') } }),
          }),
        ],
        'ver_2',
      ),
    );

    const { container } = renderCompare(mechanic({ type: 'document', currentVersionId: 'ver_2' }));

    await screen.findByLabelText('A');
    expect(differences().getByText('Paragraph')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getAllByText('Dive deeper, faster.').length).toBeGreaterThan(0),
    );
    expect(container.textContent).not.toContain('"type"');
  });

  it('reports a history it could not read', async () => {
    vi.mocked(api.getEntityHistory).mockRejectedValue(new Error('API unreachable'));
    renderCompare();

    expect(await screen.findByText('API unreachable')).toBeTruthy();
  });
});
