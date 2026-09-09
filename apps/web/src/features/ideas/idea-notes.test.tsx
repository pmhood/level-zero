// @vitest-environment jsdom
import type { Entity } from '@level-zero/domain';
import type { Editor } from '@level-zero/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IdeaInspector } from './idea-inspector';

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  updateEntity: vi.fn().mockResolvedValue(undefined),
  archiveEntity: vi.fn(),
  restoreEntity: vi.fn(),
  promoteEntity: vi.fn(),
  createEntity: vi.fn(),
  listEntities: vi.fn(),
  getEntityNeighborhood: vi.fn(),
}));

const api = await import('@/lib/api');

function idea(id: string, name: string, notes: string): Entity {
  return {
    id,
    projectId: 'prj_1',
    type: 'idea',
    name,
    description: null,
    status: 'draft',
    tags: [],
    data: {
      notes: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: notes }] }],
      },
      keepMe: 'a sibling field',
    },
    currentVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };
}

const IDEA_A = idea('idea_a', 'Oxygen management', 'Alpha notes');
const IDEA_B = idea('idea_b', 'Pressure zones', 'Beta notes');

function Harness({ selected }: { selected: Entity }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <IdeaInspector
        projectId="prj_1"
        idea={selected}
        onClose={() => {}}
        onArchived={() => {}}
        onRestored={() => {}}
      />
    </QueryClientProvider>
  );
}

/** TipTap hangs the editor off its own editable element, so a test can make a real edit. */
function mountedEditor(surface: HTMLElement): Editor {
  const { editor } = surface as HTMLElement & { editor?: Editor };
  if (!editor) throw new Error('editor is not mounted');
  return editor;
}

describe('idea notes', () => {
  beforeEach(() => vi.mocked(api.updateEntity).mockClear());
  // Vitest globals are off in this workspace, so RTL's own auto-cleanup never
  // registers itself.
  afterEach(cleanup);

  async function openNotesFor(selected: Entity) {
    const view = render(<Harness selected={selected} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }));
    await screen.findByText('Alpha notes');
    return view;
  }

  it('follows the selected idea instead of holding the previous one open', async () => {
    const { rerender } = await openNotesFor(IDEA_A);

    rerender(<Harness selected={IDEA_B} />);

    // The editor reads its content once, when it is created, so selecting a
    // different idea has to give it a fresh instance. Without that the surface
    // keeps showing the old notes and autosaves them over the new idea's.
    await screen.findByText('Beta notes');
    expect(screen.queryByText('Alpha notes')).toBeNull();
    expect(screen.getByLabelText('Notes on Pressure zones')).toBeDefined();
  });

  it('autosaves an edit against the newly selected idea', async () => {
    const { rerender } = await openNotesFor(IDEA_A);
    rerender(<Harness selected={IDEA_B} />);
    await screen.findByText('Beta notes');

    const surface = screen.getByLabelText('Notes on Pressure zones');
    act(() => {
      mountedEditor(surface).commands.insertContent(' and pressure');
    });

    await waitFor(() => expect(api.updateEntity).toHaveBeenCalledOnce(), { timeout: 4000 });

    const [projectId, entityId, patch] = vi.mocked(api.updateEntity).mock.calls[0]!;
    expect(projectId).toBe('prj_1');
    expect(entityId).toBe(IDEA_B.id);
    // The sibling field survives, because the API replaces `data` wholesale.
    expect(patch.data?.keepMe).toBe('a sibling field');
    expect(JSON.stringify(patch.data?.notes)).toContain('and pressure');
  });
});
