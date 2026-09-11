// @vitest-environment jsdom
import type { SearchResult, SearchResultPage } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommandPalette } from './command-palette';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  searchProject: vi.fn(),
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
}));

const api = await import('@/lib/api');

function searchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    projectId: 'prj_1',
    sourceType: 'entity',
    sourceId: 'ent_kael',
    entityType: 'character',
    status: 'active',
    tags: [],
    title: 'Kael Voss',
    excerpt: 'Salvager, forty, out of air.',
    sourceVersionId: null,
    updatedAt: new Date(),
    score: 1,
    ...overrides,
  };
}

function resultPage(items: SearchResult[]): SearchResultPage {
  return { items, total: items.length };
}

function renderPalette(projectId = 'prj_1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<CommandPalette projectId={projectId} projectName="Driftwake" />, { wrapper: Wrapper });
}

beforeEach(() => {
  push.mockReset();
  vi.mocked(api.searchProject).mockResolvedValue(resultPage([]));
  window.localStorage.clear();
});

afterEach(cleanup);

describe('CommandPalette', () => {
  it('opens with the trigger button and closes with Escape', async () => {
    renderPalette();

    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }));
    expect(screen.getByRole('dialog')).toBeDefined();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens with ⌘K and Ctrl+K from anywhere on the page', () => {
    renderPalette();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByRole('dialog')).toBeDefined();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('fuzzy-matches commands as the query is typed', () => {
    renderPalette();
    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }));

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'crchr' } });

    expect(screen.getByRole('option', { name: /Create Character/ })).toBeDefined();
    expect(screen.queryByRole('option', { name: /Go to Overview/ })).toBeNull();
  });

  it('navigates to the canonical entity route for a command with the keyboard alone', () => {
    renderPalette();
    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }));

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'characters' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });

    expect(push).toHaveBeenCalledWith('/projects/prj_1/characters');
    // Activating a command closes the palette, returning the user to what
    // they were doing rather than leaving a stale overlay up.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('moves the highlight with arrow keys before activating with Enter', () => {
    renderPalette();
    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }));

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'go to' } });
    // First match is "Go to Overview"; arrow down once to "Go to Idea Lab".
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });

    expect(push).toHaveBeenCalledWith('/projects/prj_1/idea-lab');
  });

  it('opens a live search result at its canonical entity route, reusing the search API', async () => {
    vi.mocked(api.searchProject).mockResolvedValue(resultPage([searchResult()]));
    renderPalette();
    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }));

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Kael' } });

    await waitFor(() => expect(screen.getByRole('option', { name: /Kael Voss/ })).toBeDefined());
    fireEvent.click(screen.getByRole('option', { name: /Kael Voss/ }));

    expect(push).toHaveBeenCalledWith('/projects/prj_1/entities/ent_kael');
    expect(api.searchProject).toHaveBeenCalledWith(
      'prj_1',
      expect.objectContaining({ q: 'Kael', mode: 'keyword', sourceType: ['entity'] }),
    );
  });

  it('keeps "Ask Level Zero" visually distinct from deterministic commands', () => {
    renderPalette();
    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }));

    const askOption = screen.getByRole('option', { name: /Ask Level Zero/ });
    const goOption = screen.getByRole('option', { name: /Go to Overview/ });

    expect(askOption.className).toContain('text-ai-foreground');
    expect(goOption.className).not.toContain('text-ai-foreground');
  });

  it('switches to semantic search when "Ask Level Zero" is chosen, without closing the palette', async () => {
    renderPalette();
    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }));

    fireEvent.click(screen.getByRole('option', { name: /Ask Level Zero/ }));
    expect(screen.getByRole('dialog')).toBeDefined();

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'the mechanic where oxygen limits exploration' },
    });

    await waitFor(() =>
      expect(api.searchProject).toHaveBeenCalledWith(
        'prj_1',
        expect.objectContaining({ mode: 'semantic' }),
      ),
    );
  });

  it('records an opened command as Recent and offers it first on the next open', () => {
    renderPalette();
    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'go to mechanics' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });

    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }));

    const recentSection = screen.getByText('Recent').closest('div');
    expect(recentSection).not.toBeNull();
    expect(within(recentSection as HTMLElement).getByRole('option', { name: /Go to Mechanics/ })).toBeDefined();
  });

  it('scopes commands and search to the given project', () => {
    renderPalette('prj_2');
    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }));

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'overview' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });

    expect(push).toHaveBeenCalledWith('/projects/prj_2');
    expect(push).not.toHaveBeenCalledWith('/projects/prj_1');
  });
});
