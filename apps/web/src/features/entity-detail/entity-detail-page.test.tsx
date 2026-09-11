// @vitest-environment jsdom
import type { Entity, EntityHistory, EntityNeighborhood, ReviewStatus } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityDetailPage } from './entity-detail-page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  getEntity: vi.fn(),
  getEntityNeighborhood: vi.fn(),
  getEntityHistory: vi.fn(),
  restoreEntity: vi.fn(),
  getReviewStatus: vi.fn(),
  listReviewHistory: vi.fn(),
  listCommentThreads: vi.fn(),
}));

const api = await import('@/lib/api');

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_haven',
    projectId: 'prj_1',
    type: 'location',
    name: 'Haven Station',
    description: 'The last stop before the drift.',
    status: 'active',
    tags: ['hub'],
    data: {},
    currentVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    ...overrides,
  };
}

function neighborhood(overrides: Partial<EntityNeighborhood> = {}): EntityNeighborhood {
  return { entity: entity(), outgoing: [], incoming: [], ...overrides };
}

function history(overrides: Partial<EntityHistory> = {}): EntityHistory {
  return {
    entityId: 'ent_haven',
    versions: [],
    currentVersionId: null,
    branches: [],
    total: 0,
    ...overrides,
  };
}

/** An entity nobody has reviewed yet. */
function reviewStatus(): ReviewStatus {
  return {
    target: {
      target: { type: 'entity', id: 'ent_haven', anchor: null, versionId: null },
      label: 'Haven',
      archived: false,
      currentVersionId: null,
    },
    state: 'draft',
    decision: null,
    staleDecision: null,
  };
}

function renderPage(projectId = 'prj_1', entityId = 'ent_haven') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <EntityDetailPage projectId={projectId} entityId={entityId} />
    </QueryClientProvider>,
  );
}

describe('EntityDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(neighborhood());
    vi.mocked(api.getEntityHistory).mockResolvedValue(history());
    // The page carries the entity's review panel; these keep it rendering its
    // empty state rather than a failed request.
    vi.mocked(api.getReviewStatus).mockResolvedValue(reviewStatus());
    vi.mocked(api.listReviewHistory).mockResolvedValue([]);
    vi.mocked(api.listCommentThreads).mockResolvedValue([]);
  });

  afterEach(cleanup);

  it('resolves a deep link by id and renders name, type, status, relationships and history', async () => {
    vi.mocked(api.getEntity).mockResolvedValue(entity());
    vi.mocked(api.getEntityNeighborhood).mockResolvedValue(
      neighborhood({
        outgoing: [
          {
            direction: 'outgoing',
            relationship: {
              id: 'rel_1',
              projectId: 'prj_1',
              sourceEntityId: 'ent_haven',
              targetEntityId: 'ent_kael',
              relation: 'contains',
              metadata: {},
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            entity: entity({ id: 'ent_kael', name: 'Kael Voss', type: 'character' }),
          },
        ],
      }),
    );
    vi.mocked(api.getEntityHistory).mockResolvedValue(
      history({
        versions: [
          {
            id: 'ver_1',
            projectId: 'prj_1',
            entityId: 'ent_haven',
            versionNumber: 1,
            parentVersionId: null,
            branchName: 'main',
            snapshot: entity(),
            reason: 'manual',
            metadata: {},
            createdBy: null,
            createdAt: new Date('2026-01-01'),
          },
        ],
        currentVersionId: 'ver_1',
      }),
    );

    renderPage('prj_1', 'ent_haven');

    // The deep link resolves straight from the ids in the URL — nothing else
    // in the app needs to have been visited first.
    await waitFor(() => expect(api.getEntity).toHaveBeenCalledWith('prj_1', 'ent_haven'));

    expect(await screen.findByRole('heading', { name: 'Haven Station' })).toBeDefined();
    expect(screen.getByText('Location')).toBeDefined();
    expect(screen.getByText('Active')).toBeDefined();
    expect(await screen.findByText('Kael Voss')).toBeDefined();
    expect(screen.getByText(/v1 · Haven Station/)).toBeDefined();
  });

  it('renders archived read-only with a Restore action, never a 404', async () => {
    vi.mocked(api.getEntity).mockResolvedValue(entity({ status: 'archived' }));
    vi.mocked(api.restoreEntity).mockResolvedValue(entity({ status: 'active' }));

    renderPage();

    expect(await screen.findByText('Archived')).toBeDefined();
    expect(screen.queryByText('Entity not found')).toBeNull();

    const restoreButton = screen.getByRole('button', { name: /restore/i });
    fireEvent.click(restoreButton);

    await waitFor(() => expect(api.restoreEntity).toHaveBeenCalledWith('prj_1', 'ent_haven'));
  });

  it('renders an in-shell empty state for a missing entity', async () => {
    vi.mocked(api.getEntity).mockRejectedValue(new api.ApiRequestError('Not found', 404));

    renderPage();

    expect(await screen.findByText('Entity not found')).toBeDefined();
    expect(
      screen.getByText("This entity doesn't exist, or you don't have access to it."),
    ).toBeDefined();
  });

  it('renders the identical empty state for a cross-project id, not a distinct message', async () => {
    // EntityService.getById already returns NotFoundError for another
    // project's id (docs/decisions/canonical-entity-routes.md §2.3, §8), so
    // this is the same 404 as the missing case — no special "wrong project"
    // copy that would confirm the entity exists elsewhere.
    vi.mocked(api.getEntity).mockRejectedValue(new api.ApiRequestError('Not found', 404));

    renderPage('prj_other', 'ent_haven');

    await waitFor(() => expect(api.getEntity).toHaveBeenCalledWith('prj_other', 'ent_haven'));
    expect(await screen.findByText('Entity not found')).toBeDefined();
    expect(
      screen.getByText("This entity doesn't exist, or you don't have access to it."),
    ).toBeDefined();
  });

  it('renders a non-404 failure distinctly from a missing entity', async () => {
    vi.mocked(api.getEntity).mockRejectedValue(new Error('Service unavailable'));

    renderPage();

    expect(await screen.findByText("Couldn't load this entity")).toBeDefined();
    expect(screen.queryByText('Entity not found')).toBeNull();
  });
});
