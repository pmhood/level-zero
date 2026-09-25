import { documentPlainText, type DocumentContent } from '@level-zero/domain';
import { Editor, Node, type Extensions, type JSONContent } from '@tiptap/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createEditorExtensions } from './editor-extensions';
import { RichTextEditor } from './rich-text-editor';
import { BASE_EDITOR_COMMANDS, matchEditorCommands } from './slash-menu';
import {
  TABBED_BLOCK_NODE,
  TABBED_BLOCK_TAB_BODY_NODE,
  TABBED_BLOCK_TAB_NODE,
  TABBED_BLOCK_TAB_TITLE_NODE,
  insertTabbedBlock,
  moveTab,
  removeTab,
  setActiveTab,
} from './tabbed-block';

/**
 * jsdom stubs, same reasoning as `step-flow.test.tsx`: inserting a tabbed
 * block calls `scrollIntoView`, which throws from inside TipTap's deferred
 * call when `getClientRects` yields no usable rect.
 */
beforeAll(() => {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () =>
      ({
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* () {},
      }) as unknown as DOMRectList;
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }
});

/**
 * A stand-in for the entity mention `apps/web` registers (same fixture as
 * `card-grid.test.tsx` and `step-flow.test.tsx`): an inline atom the editor
 * only ever knows as "an inline atom with a text and markdown form", proving
 * a tab's title and body reach an arbitrary reference node — missing or not
 * — without this package knowing what it is.
 */
const TEST_ENTITY_MENTION_NODE = 'testEntityMention';

const TestEntityMention = Node.create({
  name: TEST_ENTITY_MENTION_NODE,
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes: () => ({
    label: { default: '' },
    archived: { default: false },
  }),

  parseHTML: () => [{ tag: `span[data-type="${TEST_ENTITY_MENTION_NODE}"]` }],
  renderHTML: ({ node }) => [
    'span',
    {
      'data-type': TEST_ENTITY_MENTION_NODE,
      class: node.attrs.archived ? 'entity-reference--missing' : undefined,
    },
    node.attrs.archived ? `Archived: ${node.attrs.label}` : `@${node.attrs.label}`,
  ],
  renderText: ({ node }) =>
    node.attrs.archived ? `Archived: ${node.attrs.label}` : `@${node.attrs.label}`,
  renderMarkdown: (node) =>
    node.attrs?.archived ? `~~@${node.attrs?.label}~~` : `@${node.attrs?.label}`,
});

function entityMention(label: string, archived = false): JSONContent {
  return { type: TEST_ENTITY_MENTION_NODE, attrs: { label, archived } };
}

/** Loads content the way `RichTextEditor` does: as the editor's initial document. */
function createEditor(content: JSONContent, extensions: Extensions = []): Editor {
  return new Editor({
    extensions: createEditorExtensions({ placeholder: 'Write…', slashMenu: false, extensions }),
    content,
  });
}

function doc(...content: JSONContent[]): JSONContent {
  return { type: 'doc', content };
}

function tab(title: string, ...bodyContent: JSONContent[]): JSONContent {
  return {
    type: TABBED_BLOCK_TAB_NODE,
    content: [
      { type: TABBED_BLOCK_TAB_TITLE_NODE, content: [{ type: 'text', text: title }] },
      {
        type: TABBED_BLOCK_TAB_BODY_NODE,
        content: bodyContent.length > 0 ? bodyContent : [{ type: 'paragraph' }],
      },
    ],
  };
}

function paragraph(text: string): JSONContent {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

/** Every node type in `content`, in document order — duplicates included. */
function nodeTypes(content: JSONContent): string[] {
  const types = content.type ? [content.type] : [];
  return [...types, ...(content.content ?? []).flatMap(nodeTypes)];
}

/** The document position of the nth (0-based) node of `nodeType`. */
function nodePositionAt(editor: Editor, nodeType: string, occurrence = 0): number | null {
  const { doc: rootDoc } = editor.state;
  let seen = -1;
  let found: number | null = null;

  rootDoc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== nodeType) return true;
    seen += 1;
    if (seen === occurrence) {
      found = pos;
      return false;
    }
    return true;
  });

  return found;
}

/** The titles of every tab in a `tabbedBlock` doc, in document order. */
function tabTitles(content: JSONContent): string[] {
  const [block] = content.content ?? [];
  return (block?.content ?? []).map((t) => {
    const title = t.content?.find((c) => c.type === TABBED_BLOCK_TAB_TITLE_NODE);
    return title?.content?.map((c) => c.text ?? '').join('') ?? '';
  });
}

/** The block's `activeIndex` attribute, read straight off the live document. */
function activeIndex(editor: Editor): number {
  const blockPos = nodePositionAt(editor, TABBED_BLOCK_NODE);
  if (blockPos === null) throw new Error('tabbed block not found');
  return (editor.state.doc.nodeAt(blockPos)?.attrs.activeIndex as number) ?? 0;
}

const GAMEPLAY_DOC = doc({
  type: TABBED_BLOCK_NODE,
  attrs: { activeIndex: 0 },
  content: [
    tab('Movement', paragraph('WASD to move, Space to jump.')),
    tab('Interaction', paragraph('E to interact with nearby objects.')),
  ],
});

describe('TabbedBlock', () => {
  it('is offered from the slash menu', () => {
    expect(matchEditorCommands(BASE_EDITOR_COMMANDS, 'tabbed').map((c) => c.id)).toEqual([
      'tabbed-block',
    ]);
    expect(matchEditorCommands(BASE_EDITOR_COMMANDS, 'tabs').map((c) => c.id)).toEqual([
      'tabbed-block',
    ]);
  });

  it('inserts a two-tab block, replacing the /query, with the first name selected', () => {
    const editor = createEditor(
      doc({ type: 'paragraph', content: [{ type: 'text', text: '/tabs' }] }),
    );

    const command = BASE_EDITOR_COMMANDS.find((c) => c.id === 'tabbed-block');
    command?.run(editor, { from: 1, to: 6 });

    const [inserted] = editor.getJSON().content ?? [];
    expect(inserted?.type).toBe(TABBED_BLOCK_NODE);
    expect(tabTitles(editor.getJSON())).toEqual(['Tab 1', 'Tab 2']);

    expect(editor.state.selection.empty).toBe(false);
    const { from, to } = editor.state.selection;
    expect(editor.state.doc.textBetween(from, to)).toBe('Tab 1');

    editor.destroy();
  });

  it('inserts from the toolbar at the caret', () => {
    const editor = createEditor(doc({ type: 'paragraph' }));

    insertTabbedBlock(editor);

    expect(nodeTypes(editor.getJSON())).toContain(TABBED_BLOCK_NODE);
    expect(tabTitles(editor.getJSON())).toEqual(['Tab 1', 'Tab 2']);

    editor.destroy();
  });

  it('is inserted from the Insert toolbar group', async () => {
    const handleChange = vi.fn();
    render(
      <RichTextEditor
        mode="document"
        content={null}
        label="Game design document"
        onChange={handleChange}
      />,
    );

    await screen.findByRole('button', { name: 'Tabbed block' });
    act(() => screen.getByRole('button', { name: 'Tabbed block' }).click());

    await waitFor(() => {
      const [content] = handleChange.mock.calls.at(-1) ?? [];
      expect(nodeTypes(content as JSONContent)).toContain(TABBED_BLOCK_NODE);
    });
  });

  describe('per-tab editing', () => {
    it('keeps a tab’s name editable as ordinary document content', () => {
      const editor = createEditor(GAMEPLAY_DOC);

      editor.commands.setTextSelection({ from: 3, to: 3 + 'Movement'.length });
      editor.commands.insertContent('Locomotion');
      expect(tabTitles(editor.getJSON())).toEqual(['Locomotion', 'Interaction']);

      editor.destroy();
    });

    it('keeps a tab’s body editable independently, as ordinary document content', () => {
      const editor = createEditor(GAMEPLAY_DOC);

      editor.commands.focus('end');
      editor.commands.insertContent(' Hold Shift to sprint.');
      expect(editor.getText()).toContain(
        'E to interact with nearby objects. Hold Shift to sprint.',
      );
      // The other tab's body is untouched.
      expect(editor.getText()).toContain('WASD to move, Space to jump.');

      editor.destroy();
    });

    it('is reachable by find-in-document: its content counts as document prose', () => {
      const content = GAMEPLAY_DOC as DocumentContent;
      const text = documentPlainText(content);
      expect(text).toContain('Movement');
      expect(text).toContain('WASD to move, Space to jump.');
      expect(text).toContain('E to interact with nearby objects.');
    });

    it('survives a save/reload JSON round trip', () => {
      const source = createEditor(GAMEPLAY_DOC);

      const stored = JSON.parse(JSON.stringify(source.getJSON())) as JSONContent;
      const loaded = createEditor(stored);

      expect(loaded.getJSON()).toEqual(source.getJSON());

      source.destroy();
      loaded.destroy();
    });
  });

  describe('switching, adding, renaming, reordering and removing tabs', () => {
    function renderBlock(content: JSONContent) {
      const handleChange = vi.fn();
      render(
        <RichTextEditor
          mode="document"
          content={content}
          label="Game design document"
          onChange={handleChange}
        />,
      );
      return handleChange;
    }

    const THREE_TABS = doc({
      type: TABBED_BLOCK_NODE,
      attrs: { activeIndex: 0 },
      content: [tab('Movement'), tab('Interaction'), tab('Combat')],
    });

    it('switches the active tab on click, without touching content', async () => {
      renderBlock(GAMEPLAY_DOC);

      expect(
        (await screen.findByRole('tab', { name: 'Movement' })).getAttribute('aria-selected'),
      ).toBe('true');
      const interactionPanel = screen
        .getByText('E to interact with nearby objects.')
        .closest('[role="tabpanel"]');
      expect(interactionPanel).toHaveProperty('hidden', true);

      await act(async () => {
        fireEvent.click(screen.getByRole('tab', { name: 'Interaction' }));
      });

      expect(screen.getByRole('tab', { name: 'Interaction' }).getAttribute('aria-selected')).toBe(
        'true',
      );
      expect(screen.getByRole('tab', { name: 'Movement' }).getAttribute('aria-selected')).toBe(
        'false',
      );
      expect(interactionPanel).toHaveProperty('hidden', false);
    });

    it('is keyboard-navigable: the arrow keys move focus and activate the tab', async () => {
      renderBlock(GAMEPLAY_DOC);

      const movementTab = await screen.findByRole('tab', { name: 'Movement' });
      const interactionTab = screen.getByRole('tab', { name: 'Interaction' });

      expect(movementTab.getAttribute('tabindex')).toBe('0');
      expect(interactionTab.getAttribute('tabindex')).toBe('-1');

      await act(async () => {
        movementTab.focus();
        fireEvent.keyDown(movementTab, { key: 'ArrowRight' });
      });

      expect(document.activeElement).toBe(interactionTab);
      expect(interactionTab.getAttribute('aria-selected')).toBe('true');
      expect(interactionTab.getAttribute('tabindex')).toBe('0');
      expect(movementTab.getAttribute('tabindex')).toBe('-1');

      // Wraps around at either end.
      await act(async () => fireEvent.keyDown(interactionTab, { key: 'ArrowRight' }));
      expect(document.activeElement).toBe(movementTab);
      expect(movementTab.getAttribute('aria-selected')).toBe('true');
    });

    it('renames a tab in place, and the tab strip label follows', async () => {
      const liveEditor: { current: Editor | null } = { current: null };
      render(
        <RichTextEditor
          mode="document"
          content={GAMEPLAY_DOC}
          label="Game design document"
          onEditorReady={(editor) => {
            liveEditor.current = editor;
          }}
        />,
      );

      await screen.findByRole('tab', { name: 'Movement' });
      const editor = liveEditor.current;
      if (!editor) throw new Error('editor not ready');

      act(() => {
        editor.commands.setTextSelection({ from: 3, to: 3 + 'Movement'.length });
        editor.commands.insertContent('Locomotion');
      });

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Locomotion' })).not.toBeNull();
      });
      expect(screen.queryByRole('tab', { name: 'Movement' })).toBeNull();
    });

    it('adds a tab at the end, makes it active, in place', async () => {
      const handleChange = renderBlock(GAMEPLAY_DOC);

      const addButton = await screen.findByRole('button', { name: 'Add tab' });
      act(() => addButton.click());

      await waitFor(() => {
        const [content] = handleChange.mock.calls.at(-1) ?? [];
        expect(tabTitles(content as JSONContent)).toEqual(['Movement', 'Interaction', 'Tab 3']);
      });

      expect(screen.getByRole('tab', { name: 'Tab 3' }).getAttribute('aria-selected')).toBe('true');
    });

    it('disables moving the active tab earlier or later at either end', async () => {
      renderBlock(THREE_TABS);

      // The default active tab (Movement) is first: moving earlier is disabled.
      expect(
        (await screen.findByRole('button', { name: 'Move tab earlier' })).hasAttribute('disabled'),
      ).toBe(true);
      expect(screen.getByRole('button', { name: 'Move tab later' }).hasAttribute('disabled')).toBe(
        false,
      );

      // Switch to the last tab (Combat): now later is disabled, earlier isn't.
      await act(async () => {
        fireEvent.click(screen.getByRole('tab', { name: 'Combat' }));
      });

      expect(screen.getByRole('button', { name: 'Move tab later' }).hasAttribute('disabled')).toBe(
        true,
      );
      expect(
        screen.getByRole('button', { name: 'Move tab earlier' }).hasAttribute('disabled'),
      ).toBe(false);
    });

    it('moves the active tab later, and the rendered order matches the model', async () => {
      const handleChange = renderBlock(THREE_TABS);

      const laterButton = await screen.findByRole('button', { name: 'Move tab later' });
      act(() => laterButton.click());

      await waitFor(() => {
        const [content] = handleChange.mock.calls.at(-1) ?? [];
        expect(tabTitles(content as JSONContent)).toEqual(['Interaction', 'Movement', 'Combat']);
      });
    });

    it('will not remove the last remaining tab', async () => {
      renderBlock(
        doc({ type: TABBED_BLOCK_NODE, attrs: { activeIndex: 0 }, content: [tab('Only tab')] }),
      );

      const removeButton = await screen.findByRole('button', { name: 'Remove tab' });
      expect((removeButton as HTMLButtonElement).disabled).toBe(true);
    });

    it('removes the active tab in place, keeping the others and a valid active tab', async () => {
      const handleChange = renderBlock(THREE_TABS);

      // The default active tab is Movement (first).
      const removeButton = await screen.findByRole('button', { name: 'Remove tab' });
      act(() => removeButton.click());

      await waitFor(() => {
        const [content] = handleChange.mock.calls.at(-1) ?? [];
        expect(tabTitles(content as JSONContent)).toEqual(['Interaction', 'Combat']);
      });
    });
  });

  describe('unit-level reordering and active-tab tracking', () => {
    it('keeps activeIndex pointed at the tab that moved', () => {
      const editor = createEditor(GAMEPLAY_DOC);
      setActiveTab(editor, nodePositionAt(editor, TABBED_BLOCK_NODE)!, 0);
      expect(activeIndex(editor)).toBe(0);

      const firstTabPos = nodePositionAt(editor, TABBED_BLOCK_TAB_NODE, 0);
      if (firstTabPos === null) throw new Error('tab not found');

      moveTab(editor, firstTabPos, 1);

      expect(tabTitles(editor.getJSON())).toEqual(['Interaction', 'Movement']);
      // The active tab was "Movement"; it moved to index 1.
      expect(activeIndex(editor)).toBe(1);

      editor.destroy();
    });

    it('clamps activeIndex when the active tab is removed', () => {
      const editor = createEditor(
        doc({
          type: TABBED_BLOCK_NODE,
          attrs: { activeIndex: 1 },
          content: [tab('Movement'), tab('Interaction'), tab('Combat')],
        }),
      );

      const secondTabPos = nodePositionAt(editor, TABBED_BLOCK_TAB_NODE, 1);
      if (secondTabPos === null) throw new Error('tab not found');

      removeTab(editor, secondTabPos);

      expect(tabTitles(editor.getJSON())).toEqual(['Movement', 'Combat']);
      expect(activeIndex(editor)).toBe(1);

      editor.destroy();
    });

    it('is a no-op moving past either end', () => {
      const editor = createEditor(GAMEPLAY_DOC);
      const firstTabPos = nodePositionAt(editor, TABBED_BLOCK_TAB_NODE, 0);
      if (firstTabPos === null) throw new Error('tab not found');

      moveTab(editor, firstTabPos, -1);
      expect(tabTitles(editor.getJSON())).toEqual(['Movement', 'Interaction']);

      editor.destroy();
    });
  });

  describe('an entity reference inside a tab', () => {
    it('is written and read back like any other inline content', () => {
      const withMention = doc({
        type: TABBED_BLOCK_NODE,
        attrs: { activeIndex: 0 },
        content: [
          tab('Movement', {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Tune the ' }, entityMention('Sprint Speed')],
          }),
        ],
      });

      const editor = createEditor(withMention, [TestEntityMention]);
      expect(nodeTypes(editor.getJSON())).toContain(TEST_ENTITY_MENTION_NODE);
      expect(editor.getText()).toContain('@Sprint Speed');

      editor.destroy();
    });

    it('renders an archived entity honestly rather than breaking the block', () => {
      const withArchivedMention = doc({
        type: TABBED_BLOCK_NODE,
        attrs: { activeIndex: 0 },
        content: [
          tab('Movement', paragraph('WASD to move, Space to jump.')),
          tab('Combat', {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Uses the ' }, entityMention('Old Rig Cannon', true)],
          }),
        ],
      });

      const editor = createEditor(withArchivedMention, [TestEntityMention]);

      expect(editor.getMarkdown()).toContain('~~@Old Rig Cannon~~');
      // The rest of the block is untouched.
      expect(tabTitles(editor.getJSON())).toEqual(['Movement', 'Combat']);
      expect(editor.getText()).toContain('WASD to move, Space to jump.');

      const html = editor.getHTML();
      expect(html).toContain('entity-reference--missing');

      editor.destroy();
    });
  });

  describe('export', () => {
    it('flattens to sequential sections in Markdown, headed by each tab’s name', () => {
      const editor = createEditor(GAMEPLAY_DOC);

      const markdown = editor.getMarkdown();

      expect(markdown).toContain('### Movement');
      expect(markdown).toContain('WASD to move, Space to jump.');
      expect(markdown).toContain('### Interaction');
      expect(markdown).toContain('E to interact with nearby objects.');
      // Movement's section comes before Interaction's.
      expect(markdown.indexOf('### Movement')).toBeLessThan(markdown.indexOf('### Interaction'));

      editor.destroy();
    });

    it('exports every tab to HTML, not only the one showing in the editor', () => {
      const editor = createEditor(GAMEPLAY_DOC);

      const html = editor.getHTML();

      expect(html).toContain('data-type="tabbedBlock"');
      expect(html).toContain('data-type="tabbedBlockTab"');
      expect(html).toContain('Movement');
      expect(html).toContain('WASD to move, Space to jump.');
      expect(html).toContain('Interaction');
      expect(html).toContain('E to interact with nearby objects.');

      editor.destroy();
    });
  });
});
