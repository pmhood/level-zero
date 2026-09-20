// @vitest-environment jsdom
import type { DocumentVersion, Entity, Project } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GddDocumentHeader } from './gdd-document-header';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  listDocuments: vi.fn(),
  createDocument: vi.fn(),
  updateEntity: vi.fn(),
  archiveEntity: vi.fn(),
  restoreEntity: vi.fn(),
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

function documentEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'doc_1',
    projectId: 'prj_1',
    type: 'document',
    name: 'Game Design Document',
    description: null,
    status: 'active',
    tags: [],
    data: {},
    currentVersionId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    archivedAt: null,
    ...overrides,
  };
}

function version(overrides: Partial<DocumentVersion> = {}): DocumentVersion {
  return {
    id: 'ver_1',
    documentId: 'doc_1',
    versionNumber: 3,
    name: null,
    reason: 'manual',
    generationId: null,
    parentVersionId: null,
    createdBy: null,
    createdAt: new Date('2026-01-05T00:00:00.000Z'),
    isCurrent: true,
    ...overrides,
  };
}

function renderHeader(props: Partial<ComponentProps<typeof GddDocumentHeader>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <GddDocumentHeader
        projectId="prj_1"
        project={project()}
        documentEntity={documentEntity()}
        currentVersion={null}
        archived={false}
        comparing={false}
        onToggleCompare={vi.fn()}
        onToggleHistory={vi.fn()}
        onToggleReview={vi.fn()}
        onToggleAskAi={vi.fn()}
        onExport={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  push.mockClear();
  vi.mocked(api.listDocuments).mockResolvedValue({ items: [documentEntity()], total: 1 });
});

afterEach(cleanup);

describe('GddDocumentHeader — content from the project', () => {
  it('carries the project name and description rather than retyped copy', () => {
    renderHeader({
      project: project({ name: 'Driftwake', description: 'A haunting salvage journey.' }),
    });

    expect(screen.getByRole('heading', { name: 'Driftwake' })).toBeDefined();
    expect(screen.getByText('A haunting salvage journey.')).toBeDefined();
  });

  it('shows the breadcrumb from Projects through the project to the GDD tool', () => {
    renderHeader({ project: project({ name: 'Driftwake' }) });

    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumb).getByRole('link', { name: 'Projects' }).getAttribute('href')).toBe(
      '/',
    );
    expect(within(breadcrumb).getByRole('link', { name: 'Driftwake' }).getAttribute('href')).toBe(
      '/projects/prj_1',
    );
    expect(within(breadcrumb).getByText('GDD')).toBeDefined();
  });

  it('shows the document name through the existing document switcher', () => {
    renderHeader({ documentEntity: documentEntity({ name: 'Combat Brief' }) });

    expect(screen.getByRole('button', { name: /Combat Brief/ })).toBeDefined();
  });
});

describe('GddDocumentHeader — the version pill', () => {
  it('shows the version history’s newest entry', () => {
    renderHeader({ currentVersion: version({ versionNumber: 3 }) });

    expect(screen.getByText('v3')).toBeDefined();
  });

  it('shows nothing when the document has no versions yet', () => {
    renderHeader({ currentVersion: null });

    expect(screen.queryByText(/^v\d/)).toBeNull();
  });
});

describe('GddDocumentHeader — the empty-artwork case', () => {
  it('still reads as the cinematic header without any key art', () => {
    const { container } = renderHeader();

    const hero = container.querySelector('header');
    expect(hero?.className).toContain('min-h-[180px]');
    expect(hero?.style.backgroundImage).toBe('');
  });
});

describe('GddDocumentHeader — actions reach the right surface', () => {
  it('History opens the panel from #184', () => {
    const onToggleHistory = vi.fn();
    renderHeader({ onToggleHistory });

    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    expect(onToggleHistory).toHaveBeenCalledOnce();
  });

  it('Compare enters the existing compare mode, and offers a way back', () => {
    const onToggleCompare = vi.fn();
    const { rerender } = renderHeader({ onToggleCompare, comparing: false });

    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(onToggleCompare).toHaveBeenCalledOnce();

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    rerender(
      <QueryClientProvider client={queryClient}>
        <GddDocumentHeader
          projectId="prj_1"
          project={project()}
          documentEntity={documentEntity()}
          currentVersion={null}
          archived={false}
          comparing
          onToggleCompare={onToggleCompare}
          onToggleHistory={vi.fn()}
          onToggleReview={vi.fn()}
          onToggleAskAi={vi.fn()}
          onExport={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('button', { name: 'Back to writing' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /History/ })).toBeNull();
  });

  it('Review opens the section review and comments panel from #187', () => {
    const onToggleReview = vi.fn();
    renderHeader({ onToggleReview });

    fireEvent.click(screen.getByRole('button', { name: /Review/ }));
    expect(onToggleReview).toHaveBeenCalledOnce();
  });

  it('keeps Review on an archived document, where the toolbar is hidden', () => {
    // Archiving freezes the prose, not the conversation about it — and with
    // the editor read-only, its Comment button is gone, so this is the only
    // way into the panel.
    const onToggleReview = vi.fn();
    renderHeader({ archived: true, onToggleReview });

    fireEvent.click(screen.getByRole('button', { name: /Review/ }));
    expect(onToggleReview).toHaveBeenCalledOnce();
  });

  it('Export offers Markdown and HTML, and reports which one was chosen', () => {
    const onExport = vi.fn();
    renderHeader({ onExport });

    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Markdown (.md)' }));
    expect(onExport).toHaveBeenCalledOnce();
    expect(onExport).toHaveBeenCalledWith('markdown');

    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'HTML (.html)' }));
    expect(onExport).toHaveBeenCalledTimes(2);
    expect(onExport).toHaveBeenCalledWith('html');
  });

  it('never offers Publish or Share — neither has a model yet', () => {
    renderHeader();

    expect(screen.queryByRole('button', { name: /Publish/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Share/ })).toBeNull();
  });

  it('hides Ask AI for an archived document, and shows the Archived badge', () => {
    renderHeader({ archived: true });

    expect(screen.getByText('Archived')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Ask AI/ })).toBeNull();
  });

  it('Ask AI opens the AI inspector for an active document', () => {
    const onToggleAskAi = vi.fn();
    renderHeader({ archived: false, onToggleAskAi });

    fireEvent.click(screen.getByRole('button', { name: /Ask AI/ }));
    expect(onToggleAskAi).toHaveBeenCalledOnce();
  });
});
