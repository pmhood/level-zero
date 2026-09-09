// @vitest-environment jsdom
import type { Entity } from '@level-zero/domain';
import type { Editor } from '@level-zero/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHARACTER_BACKGROUND_FIELD } from './character';
import { CharacterProse } from './character-prose';

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  updateEntity: vi.fn().mockResolvedValue(undefined),
}));

const api = await import('@/lib/api');

function character(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_kael',
    projectId: 'prj_1',
    type: 'character',
    name: 'Kael Voss',
    description: null,
    status: 'active',
    tags: [],
    data: {
      background: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Born on the shelf' }] }],
      },
      role: 'Salvager',
    },
    currentVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    ...overrides,
  };
}

function renderProse(subject: Entity = character()) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CharacterProse
        projectId="prj_1"
        character={subject}
        field={CHARACTER_BACKGROUND_FIELD}
        label="Background"
        mode="document"
        placeholder="Where they came from."
      />
    </QueryClientProvider>,
  );
}

/** TipTap hangs the editor off its own editable element, so a test can make a real edit. */
function mountedEditor(surface: HTMLElement): Editor {
  const { editor } = surface as HTMLElement & { editor?: Editor };
  if (!editor) throw new Error('editor is not mounted');
  return editor;
}

describe('character prose', () => {
  beforeEach(() => vi.mocked(api.updateEntity).mockClear());
  afterEach(cleanup);

  it('opens the document the character already carries', async () => {
    renderProse();

    await screen.findByText('Born on the shelf');
  });

  it('autosaves as TipTap JSON into the character, keeping its other fields', async () => {
    renderProse();
    await screen.findByText('Born on the shelf');

    const surface = screen.getByLabelText('Background for Kael Voss');
    act(() => {
      mountedEditor(surface).commands.insertContent(', before the flood');
    });

    await waitFor(() => expect(api.updateEntity).toHaveBeenCalledOnce(), { timeout: 4000 });

    const [projectId, entityId, patch] = vi.mocked(api.updateEntity).mock.calls[0]!;
    expect(projectId).toBe('prj_1');
    expect(entityId).toBe('ent_kael');
    expect(patch.data?.role).toBe('Salvager');
    expect(JSON.stringify(patch.data?.background)).toContain('before the flood');
  });

  it('will not open an archived character for writing', () => {
    renderProse(character({ status: 'archived', archivedAt: new Date() }));

    expect(screen.getByText('Restore this character before editing it.')).toBeDefined();
    expect(screen.queryByLabelText('Background for Kael Voss')).toBeNull();
  });
});
