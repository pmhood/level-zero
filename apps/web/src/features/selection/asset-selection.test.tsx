// @vitest-environment jsdom
import type { Asset, AssetMark, AssetSelection, Entity } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetSelectionActions, AssetSelectionBadges } from './asset-selection-actions';
import { CurrentSelections } from './current-selections';

vi.mock('@/lib/api', () => ({
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  assetContentUrl: (projectId: string, assetId: string) => `/assets/${projectId}/${assetId}`,
  getAssetSelectionSummary: vi.fn(),
  listEntityAssetSelections: vi.fn(),
  listAssetSelectionsForAsset: vi.fn(),
  listAssetMarks: vi.fn(),
  approveAssetSelection: vi.fn(),
  rejectAssetSelection: vi.fn(),
  markAsset: vi.fn(),
  unmarkAsset: vi.fn(),
}));

const api = await import('@/lib/api');

const context = { entityId: 'ent_1', purpose: 'portrait' };

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'ast_1',
    projectId: 'prj_1',
    kind: 'image',
    filename: 'kael-portrait.png',
    mimeType: 'image/png',
    byteSize: 2048,
    storageKey: 'projects/prj_1/kael-portrait.png',
    checksum: 'abc',
    width: 1024,
    height: 1024,
    durationSeconds: null,
    variant: 'source',
    sourceAssetId: null,
    status: 'active',
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    updatedAt: new Date('2026-03-01T09:00:00.000Z'),
    archivedAt: null,
    createdBy: null,
    ...overrides,
  };
}

function selection(overrides: Partial<AssetSelection> = {}): AssetSelection {
  return {
    id: 'sel_1',
    projectId: 'prj_1',
    assetId: 'ast_1',
    context,
    state: 'approved',
    actor: 'You',
    note: null,
    supersededBySelectionId: null,
    decidedAt: new Date('2026-03-01T09:00:00.000Z'),
    ...overrides,
  };
}

function mark(overrides: Partial<AssetMark> = {}): AssetMark {
  return {
    id: 'mark_1',
    projectId: 'prj_1',
    assetId: 'ast_1',
    kind: 'favorite',
    actor: 'You',
    markedAt: new Date('2026-03-01T09:00:00.000Z'),
    ...overrides,
  };
}

function character(): Entity {
  return {
    id: 'ent_1',
    projectId: 'prj_1',
    type: 'character',
    name: 'Kael Voss',
    description: null,
    status: 'active',
    tags: [],
    data: {},
    currentVersionId: null,
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    updatedAt: new Date('2026-03-01T09:00:00.000Z'),
    archivedAt: null,
  };
}

/**
 * Clicks once the query behind the button has answered.
 *
 * The triage buttons stay disabled until the context's selections are in, since
 * what an approval supersedes is read from them.
 */
async function clickWhenReady(name: string | RegExp) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
}

function wrap(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAssetSelectionSummary).mockResolvedValue({ context, current: [], history: [] });
  vi.mocked(api.listEntityAssetSelections).mockResolvedValue([]);
  vi.mocked(api.listAssetMarks).mockResolvedValue([]);
  vi.mocked(api.approveAssetSelection).mockResolvedValue({
    approval: selection(),
    superseded: [],
  });
  vi.mocked(api.rejectAssetSelection).mockResolvedValue(selection({ state: 'rejected' }));
  vi.mocked(api.markAsset).mockResolvedValue(mark());
  vi.mocked(api.unmarkAsset).mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('triaging one asset', () => {
  it('approves for the purpose on screen, naming who decided', async () => {
    wrap(<AssetSelectionActions projectId="prj_1" asset={asset()} context={context} />);

    await clickWhenReady('Approve as portrait');

    await waitFor(() =>
      expect(api.approveAssetSelection).toHaveBeenCalledWith('prj_1', {
        assetId: 'ast_1',
        entityId: 'ent_1',
        purpose: 'portrait',
        actor: 'You',
      }),
    );
  });

  it('supersedes the current choice where the purpose holds one visual', async () => {
    vi.mocked(api.getAssetSelectionSummary).mockResolvedValue({
      context,
      current: [selection({ id: 'sel_0', assetId: 'ast_0' })],
      history: [selection({ id: 'sel_0', assetId: 'ast_0' })],
    });

    wrap(
      <AssetSelectionActions projectId="prj_1" asset={asset()} context={context} replaceCurrent />,
    );

    await clickWhenReady('Make current portrait');

    await waitFor(() =>
      expect(api.approveAssetSelection).toHaveBeenCalledWith(
        'prj_1',
        expect.objectContaining({ assetId: 'ast_1', supersedes: ['ast_0'] }),
      ),
    );
  });

  it('joins the existing approvals where several can stand', async () => {
    vi.mocked(api.getAssetSelectionSummary).mockResolvedValue({
      context: { entityId: 'ent_1', purpose: 'costume' },
      current: [selection({ id: 'sel_0', assetId: 'ast_0' })],
      history: [selection({ id: 'sel_0', assetId: 'ast_0' })],
    });

    wrap(
      <AssetSelectionActions
        projectId="prj_1"
        asset={asset()}
        context={{ entityId: 'ent_1', purpose: 'costume' }}
      />,
    );

    await clickWhenReady('Approve as costume exploration');

    await waitFor(() => expect(api.approveAssetSelection).toHaveBeenCalled());
    expect(vi.mocked(api.approveAssetSelection).mock.calls[0]?.[1]).not.toHaveProperty(
      'supersedes',
    );
  });

  it('offers no approval for the asset already chosen', async () => {
    vi.mocked(api.getAssetSelectionSummary).mockResolvedValue({
      context,
      current: [selection()],
      history: [selection()],
    });

    wrap(<AssetSelectionActions projectId="prj_1" asset={asset()} context={context} />);

    await waitFor(() => expect(screen.queryByRole('button', { name: /Approve as/ })).toBeNull());
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy();
  });

  it('rejects without touching the file', async () => {
    wrap(<AssetSelectionActions projectId="prj_1" asset={asset()} context={context} />);

    await clickWhenReady('Reject');

    await waitFor(() =>
      expect(api.rejectAssetSelection).toHaveBeenCalledWith('prj_1', {
        assetId: 'ast_1',
        entityId: 'ent_1',
        purpose: 'portrait',
        actor: 'You',
      }),
    );
  });

  it('stars an asset nobody has starred', async () => {
    wrap(<AssetSelectionActions projectId="prj_1" asset={asset()} context={context} />);

    await clickWhenReady('Add favourite on kael-portrait.png');

    await waitFor(() =>
      expect(api.markAsset).toHaveBeenCalledWith('prj_1', {
        assetId: 'ast_1',
        kind: 'favorite',
        actor: 'You',
      }),
    );
  });

  it('takes the star off one already starred', async () => {
    vi.mocked(api.listAssetMarks).mockResolvedValue([mark()]);

    wrap(<AssetSelectionActions projectId="prj_1" asset={asset()} context={context} />);

    await clickWhenReady('Remove favourite on kael-portrait.png');

    await waitFor(() => expect(api.unmarkAsset).toHaveBeenCalledWith('prj_1', 'ast_1', 'favorite'));
  });

  it('says what the asset is, never colour alone', async () => {
    vi.mocked(api.getAssetSelectionSummary).mockResolvedValue({
      context,
      current: [selection()],
      history: [selection()],
    });
    vi.mocked(api.listAssetMarks).mockResolvedValue([mark({ kind: 'shortlisted' })]);

    wrap(<AssetSelectionBadges projectId="prj_1" asset={asset()} context={context} />);

    expect(await screen.findByText('Current portrait')).toBeTruthy();
    expect(screen.getByText('Shortlisted')).toBeTruthy();
  });

  it('reads a superseded asset as superseded rather than as still approved', async () => {
    vi.mocked(api.getAssetSelectionSummary).mockResolvedValue({
      context,
      current: [],
      history: [selection({ state: 'superseded', supersededBySelectionId: 'sel_9' })],
    });

    wrap(<AssetSelectionBadges projectId="prj_1" asset={asset()} context={context} />);

    expect(await screen.findByText('Superseded')).toBeTruthy();
  });
});

describe('what an entity stands behind', () => {
  it('says nothing is chosen before anybody chooses', async () => {
    wrap(<CurrentSelections projectId="prj_1" entity={character()} />);

    expect(await screen.findByText('Nothing chosen yet')).toBeTruthy();
  });

  it('groups the current selections by what they were approved for', async () => {
    vi.mocked(api.listEntityAssetSelections).mockResolvedValue([
      selection({
        id: 'sel_2',
        assetId: 'ast_2',
        context: { entityId: 'ent_1', purpose: 'costume' },
      }),
      selection(),
    ]);

    wrap(<CurrentSelections projectId="prj_1" entity={character()} />);

    await waitFor(() => expect(screen.getByText('Portrait')).toBeTruthy());
    expect(screen.getByText('Costume exploration')).toBeTruthy();
  });

  it('keeps a superseded choice readable, and names what replaced it', async () => {
    const replacement = selection({ id: 'sel_2', assetId: 'ast_2', actor: 'Brun' });
    vi.mocked(api.listEntityAssetSelections).mockResolvedValue([
      replacement,
      selection({ state: 'superseded', supersededBySelectionId: 'sel_2' }),
    ]);

    wrap(<CurrentSelections projectId="prj_1" entity={character()} />);

    const history = within(await screen.findByRole('region', { name: 'Selection history' }));
    expect(history.getByText('Superseded')).toBeTruthy();
    expect(history.getByText(/Replaced by/)).toBeTruthy();
    expect(history.getAllByText(/Brun/).length).toBeGreaterThan(0);
  });
});
