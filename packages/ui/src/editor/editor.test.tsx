import { Editor, type JSONContent } from '@tiptap/core';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEditorExtensions } from './editor-extensions';
import { looksLikeMarkdown } from './markdown-paste';
import { RichTextEditor } from './rich-text-editor';
import { BASE_EDITOR_COMMANDS, matchEditorCommands } from './slash-menu';
import { useEditorAutosave } from './use-editor-autosave';

/** One document exercising every node the base extension set supports. */
const MARKDOWN = `# Design pillars

A **bold** claim with *emphasis* and a [link](https://example.com).

## Core loop

- Explore
- Scavenge

1. First
2. Second

- [ ] Write the loop
- [x] Name the game

> Tension comes from oxygen.

| Stat | Value |
| --- | --- |
| Oxygen | 120s |

\`\`\`ts
const depth = 1;
\`\`\`

![Concept](https://example.com/concept.png)

---
`;

/** Loads content the way `RichTextEditor` does: as the editor's initial document. */
function createEditor(content: JSONContent | string): Editor {
  return new Editor({
    extensions: createEditorExtensions({ placeholder: 'Write…', slashMenu: false }),
    content,
    contentType: typeof content === 'string' ? 'markdown' : 'json',
  });
}

function nodeTypes(content: JSONContent): string[] {
  const types = content.type ? [content.type] : [];
  return [...types, ...(content.content ?? []).flatMap(nodeTypes)];
}

describe('createEditorExtensions', () => {
  it('parses the supported node set out of Markdown', () => {
    const editor = createEditor(MARKDOWN);

    expect(new Set(nodeTypes(editor.getJSON()))).toEqual(
      new Set([
        'doc',
        'heading',
        'paragraph',
        'text',
        'bulletList',
        'orderedList',
        'listItem',
        'taskList',
        'taskItem',
        'blockquote',
        'table',
        'tableRow',
        'tableHeader',
        'tableCell',
        'codeBlock',
        'image',
        'horizontalRule',
      ]),
    );

    editor.destroy();
  });

  it('keeps structure through the persisted JSON round trip', () => {
    const source = createEditor(MARKDOWN);

    // Exactly what persistence does: JSON out, JSON back in.
    const stored = JSON.parse(JSON.stringify(source.getJSON())) as JSONContent;
    const loaded = createEditor(stored);

    expect(loaded.getJSON()).toEqual(source.getJSON());

    source.destroy();
    loaded.destroy();
  });

  it('exports back to Markdown', () => {
    const editor = createEditor(MARKDOWN);

    const markdown = editor.getMarkdown();

    expect(markdown).toContain('# Design pillars');
    expect(markdown).toContain(
      'A **bold** claim with *emphasis* and a [link](https://example.com)',
    );
    expect(markdown).toContain('- Explore');
    expect(markdown).toContain('1. First');
    expect(markdown).toContain('- [ ] Write the loop');
    expect(markdown).toContain('- [x] Name the game');
    expect(markdown).toContain('> Tension comes from oxygen.');
    expect(markdown).toContain('| Oxygen');
    expect(markdown).toContain('```ts');
    expect(markdown).toContain('![Concept](https://example.com/concept.png)');

    editor.destroy();
  });

  it('leaves the undo history intact so an edit can be undone', () => {
    const editor = createEditor('Oxygen runs out.\n');
    const before = editor.getJSON();

    editor.commands.insertContentAt(1, 'Air, not ');
    expect(editor.getText()).toBe('Air, not Oxygen runs out.');

    editor.commands.undo();
    expect(editor.getJSON()).toEqual(before);

    editor.destroy();
  });
});

describe('looksLikeMarkdown', () => {
  it.each([
    '# Heading',
    '- a list item',
    '1. first',
    '> quoted',
    '```ts',
    '| a | b |',
    'a [link](https://example.com)',
    'a **bold** word',
    '---',
  ])('recognises %j', (text) => {
    expect(looksLikeMarkdown(text)).toBe(true);
  });

  it.each(['Just a sentence.', 'https://example.com/a-b', 'a * b * c', ''])(
    'leaves %j as plain text',
    (text) => {
      expect(looksLikeMarkdown(text)).toBe(false);
    },
  );
});

describe('matchEditorCommands', () => {
  it('returns everything for an empty query', () => {
    expect(matchEditorCommands(BASE_EDITOR_COMMANDS, '')).toHaveLength(BASE_EDITOR_COMMANDS.length);
  });

  it('matches on the title and on extra keywords', () => {
    expect(matchEditorCommands(BASE_EDITOR_COMMANDS, 'quo').map((c) => c.id)).toEqual([
      'blockquote',
    ]);
    expect(matchEditorCommands(BASE_EDITOR_COMMANDS, 'todo').map((c) => c.id)).toEqual([
      'task-list',
    ]);
  });
});

describe('RichTextEditor', () => {
  it('renders the toolbar its mode asks for', async () => {
    render(<RichTextEditor mode="document" content={null} label="Game design document" />);

    await screen.findByRole('button', { name: 'Bold' });
    expect(screen.getByRole('button', { name: 'H1' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Table' })).toBeDefined();
  });

  it('drops the document-only groups in compact mode', async () => {
    render(<RichTextEditor mode="compact" content={null} label="Notes" />);

    await screen.findByRole('button', { name: 'Bold' });
    expect(screen.queryByRole('button', { name: 'H1' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Table' })).toBeNull();
  });

  it('renders the content it is given', async () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Core loop' }] },
      ],
    };

    render(<RichTextEditor content={content} label="Game design document" />);

    await waitFor(() => expect(screen.getByText('Core loop')).toBeDefined());
  });
});

describe('useEditorAutosave', () => {
  afterEach(() => vi.useRealTimers());

  const content: JSONContent = { type: 'doc', content: [] };

  it('saves once for a burst of edits and reports the state as it goes', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEditorAutosave(save, { delayMs: 100 }));

    expect(result.current.status).toBe('idle');

    act(() => {
      result.current.onChange(content);
      result.current.onChange(content);
      result.current.onChange(content);
    });
    expect(result.current.status).toBe('pending');
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('saved');
    expect(result.current.error).toBeNull();
  });

  it('surfaces a failed save', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockRejectedValue(new Error('API is down'));
    const { result } = renderHook(() => useEditorAutosave(save, { delayMs: 100 }));

    act(() => result.current.onChange(content));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toBe('API is down');
  });

  it('flushes an edit still waiting when the surface unmounts', () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useEditorAutosave(save, { delayMs: 100 }));

    act(() => result.current.onChange(content));
    unmount();

    expect(save).toHaveBeenCalledExactlyOnceWith(content);
  });
});
