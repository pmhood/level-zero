// @vitest-environment jsdom
import type { Project, SearchResult } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchWorkspace } from './search-workspace';

let currentSearch = '';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  getProject: vi.fn(),
  searchProject: vi.fn(),
}));

const api = await import('@/lib/api');

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'prj_1',
    name: 'Driftwake',
    description: 'A salvage the past. Survive what remains.',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    archivedAt: null,
    ...overrides,
  };
}

function renderSearch() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SearchWorkspace projectId="prj_1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  currentSearch = '';
  vi.mocked(api.getProject).mockResolvedValue(project());
  vi.mocked(api.searchProject).mockResolvedValue({ items: [] as SearchResult[], total: 0 });
});

afterEach(cleanup);

describe('SearchWorkspace — scope seeding (#191)', () => {
  it('defaults to Everything when the URL carries no scope', () => {
    renderSearch();

    expect(screen.getByRole('button', { name: 'Everything' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('pre-scopes to Document when the GDD links in with ?scope=document', () => {
    currentSearch = 'scope=document';

    renderSearch();

    expect(screen.getByRole('button', { name: 'Document' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Everything' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('ignores a scope the search page does not offer', () => {
    currentSearch = 'scope=asset';

    renderSearch();

    expect(screen.getByRole('button', { name: 'Everything' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});
