import { documentPlainText, type DocumentContent } from '@level-zero/domain';
import { Editor, mergeAttributes, Node, type Extensions, type JSONContent } from '@tiptap/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  CARD_BODY_NODE,
  CARD_GRID_NODE,
  CARD_NODE,
  CARD_TITLE_NODE,
  addCard,
  insertCardGrid,
  moveCard,
  removeCard,
} from './card-grid';
import { createEditorExtensions } from './editor-extensions';
import { RichTextEditor } from './rich-text-editor';
import { BASE_EDITOR_COMMANDS, matchEditorCommands } from './slash-menu';

/**
 * jsdom has no layout engine (see `callout-pull-quote.test.tsx`'s identical
 * comment) — `insertCardGrid`'s `scrollIntoView` needs both `getClientRects`
 * and `getBoundingClientRect` on `Range`, or a slow enough run surfaces an
 * uncaught exception from TipTap's deferred call.
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
 * Stands in for `apps/web`'s real entity mention (`entity-mention.tsx`):
 * an inline atom `extensions` passes in, exactly the seam
 * `editor-extensions.ts`'s `EditorExtensionOptions.extensions` documents.
 * `packages/ui` never imports the real one — that would be exactly the
 * entity-awareness issue #263 forbids — so this fixture is what proves a
 * card's title and body reach an arbitrary reference node, missing or not,
 * without this package knowing what it is.
 */
const TEST_ENTITY_MENTION_NODE = 'testEntityMention';

const TestEntityMention = Node.create({
  name: TEST_ENTITY_MENTION_NODE,
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes: () => ({
    label: { default: '' },
    missing: { default: false },
  }),

  parseHTML: () => [{ tag: `span[data-type="${TEST_ENTITY_MENTION_NODE}"]` }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'span',
    mergeAttributes(
      {
        'data-type': TEST_ENTITY_MENTION_NODE,
        class: node.attrs.missing ? 'entity-reference--missing' : undefined,
      },
      HTMLAttributes,
    ),
    node.attrs.missing ? `Missing: ${node.attrs.label}` : `@${node.attrs.label}`,
  ],
  renderText: ({ node }) =>
    node.attrs.missing ? `Missing: ${node.attrs.label}` : `@${node.attrs.label}`,
  renderMarkdown: (node) =>
    node.attrs?.missing ? `~~@${node.attrs?.label}~~` : `@${node.attrs?.label}`,
});

function entityMention(label: string, missing = false): JSONContent {
  return { type: TEST_ENTITY_MENTION_NODE, attrs: { label, missing } };
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

/** Every card's title, in document order. */
function cardTitles(editor: Editor): string[] {
  const titles: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === CARD_NODE) titles.push(node.firstChild?.textContent ?? '');
  });
  return titles;
}

function renameCard(editor: Editor, occurrence: number, title: string): void {
  const titlePos = nodePositionAt(editor, CARD_TITLE_NODE, occurrence);
  if (titlePos === null) throw new Error('card title not found');
  const titleNode = editor.state.doc.nodeAt(titlePos);
  editor.commands.setTextSelection({
    from: titlePos + 1,
    to: titlePos + 1 + (titleNode?.content.size ?? 0),
  });
  editor.commands.insertContent(title);
}

const CARD_GRID_DOC = doc({
  type: CARD_GRID_NODE,
  content: [
    {
      type: CARD_NODE,
      attrs: { icon: 'star' },
      content: [
        { type: CARD_TITLE_NODE, content: [{ type: 'text', text: 'Explore' }] },
        {
          type: CARD_BODY_NODE,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Discover haunting environments filled with secrets.' },
              ],
            },
          ],
        },
      ],
    },
    {
      type: CARD_NODE,
      attrs: { icon: 'idea' },
      content: [
        {
          type: CARD_TITLE_NODE,
          content: [entityMention('Scavenge')],
        },
        {
          type: CARD_BODY_NODE,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Find, repair, and repurpose lost tech.' }],
            },
          ],
        },
      ],
    },
  ],
});

describe('CardGrid', () => {
  it('is offered from the slash menu', () => {
    expect(matchEditorCommands(BASE_EDITOR_COMMANDS, 'pillars').map((c) => c.id)).toEqual([
      'card-grid',
    ]);
    expect(matchEditorCommands(BASE_EDITOR_COMMANDS, 'card grid').map((c) => c.id)).toEqual([
      'card-grid',
    ]);
  });

  it('inserts a card grid of two cards, replacing the /query, with the first title selected', () => {
    const editor = createEditor(
      doc({ type: 'paragraph', content: [{ type: 'text', text: '/cards' }] }),
    );

    const command = BASE_EDITOR_COMMANDS.find((c) => c.id === 'card-grid');
    command?.run(editor, { from: 1, to: 7 });

    const [inserted] = editor.getJSON().content ?? [];
    expect(inserted?.type).toBe(CARD_GRID_NODE);
    expect(inserted?.content).toHaveLength(2);

    expect(editor.state.selection.empty).toBe(false);
    const { from, to } = editor.state.selection;
    expect(editor.state.doc.textBetween(from, to)).toBe('New card');

    editor.destroy();
  });

  it('inserts from the toolbar at the caret', () => {
    const editor = createEditor(doc({ type: 'paragraph' }));

    insertCardGrid(editor);

    expect(nodeTypes(editor.getJSON())).toContain(CARD_GRID_NODE);
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

    await screen.findByRole('button', { name: 'Card grid' });
    act(() => screen.getByRole('button', { name: 'Card grid' }).click());

    await waitFor(() => {
      const [content] = handleChange.mock.calls.at(-1) ?? [];
      expect(nodeTypes(content as JSONContent)).toContain(CARD_GRID_NODE);
    });
  });

  it('keeps each card editable independently as ordinary document content', () => {
    const editor = createEditor(CARD_GRID_DOC, [TestEntityMention]);

    renameCard(editor, 0, 'Explore further');
    expect(cardTitles(editor)[0]).toBe('Explore further');
    // The second card's title, holding an entity mention, is untouched.
    expect(editor.getText()).toContain('@Scavenge');

    editor.destroy();
  });

  it('adds a card to the grid, in place, with the caret in its title', () => {
    const editor = createEditor(CARD_GRID_DOC, [TestEntityMention]);
    const gridPos = nodePositionAt(editor, CARD_GRID_NODE);
    if (gridPos === null) throw new Error('grid not found');

    addCard(editor, gridPos);

    const [grid] = editor.getJSON().content ?? [];
    expect(grid?.content).toHaveLength(3);
    expect(cardTitles(editor)[2]).toBe('New card');

    editor.destroy();
  });

  it('reorders cards in place, and is a no-op past either end', () => {
    const editor = createEditor(CARD_GRID_DOC, [TestEntityMention]);
    expect(cardTitles(editor)[0]).toBe('Explore');

    const firstCardPos = nodePositionAt(editor, CARD_NODE, 0);
    if (firstCardPos === null) throw new Error('card not found');

    // Already first: moving left is a no-op.
    moveCard(editor, firstCardPos, -1);
    expect(cardTitles(editor)[0]).toBe('Explore');

    moveCard(editor, firstCardPos, 1);
    const titlesAfterSwap = cardTitles(editor);
    expect(titlesAfterSwap[0]).not.toBe('Explore');
    expect(editor.state.doc.textContent).toContain('Explore');

    editor.destroy();
  });

  it('removes a card in place, and removes the whole grid when the last card goes', () => {
    const editor = createEditor(CARD_GRID_DOC, [TestEntityMention]);

    const firstCardPos = nodePositionAt(editor, CARD_NODE, 0);
    if (firstCardPos === null) throw new Error('card not found');
    removeCard(editor, firstCardPos);

    const grid = editor.getJSON().content?.[0];
    expect(grid?.type).toBe(CARD_GRID_NODE);
    expect(grid?.content).toHaveLength(1);
    expect(cardTitles(editor)).toHaveLength(1);

    const remainingCardPos = nodePositionAt(editor, CARD_NODE, 0);
    if (remainingCardPos === null) throw new Error('card not found');
    removeCard(editor, remainingCardPos);

    expect(nodeTypes(editor.getJSON())).not.toContain(CARD_GRID_NODE);

    editor.destroy();
  });

  it('holds an entity reference through the existing mention seam, and a missing one renders honestly', () => {
    const withMissingReference = doc({
      type: CARD_GRID_NODE,
      content: [
        {
          type: CARD_NODE,
          attrs: { icon: 'star' },
          content: [
            { type: CARD_TITLE_NODE, content: [entityMention('Retired Pillar', true)] },
            {
              type: CARD_BODY_NODE,
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'No longer canonical.' }] },
              ],
            },
          ],
        },
      ],
    });

    const editor = createEditor(withMissingReference, [TestEntityMention]);

    // The card, and the rest of the document, render without throwing.
    expect(editor.getText()).toContain('Missing: Retired Pillar');
    expect(nodeTypes(editor.getJSON())).toContain(TEST_ENTITY_MENTION_NODE);

    const html = editor.getHTML();
    expect(html).toContain('entity-reference--missing');
    expect(html).toContain('Missing: Retired Pillar');

    editor.destroy();
  });

  it('is reachable by find-in-document: its content counts as document prose', () => {
    const content = CARD_GRID_DOC as DocumentContent;
    const text = documentPlainText(content);
    expect(text).toContain('Explore');
    expect(text).toContain('Discover haunting environments filled with secrets.');
    expect(text).toContain('Find, repair, and repurpose lost tech.');
  });

  it('survives a save/reload JSON round trip', () => {
    const source = createEditor(CARD_GRID_DOC, [TestEntityMention]);

    const stored = JSON.parse(JSON.stringify(source.getJSON())) as JSONContent;
    const loaded = createEditor(stored, [TestEntityMention]);

    expect(loaded.getJSON()).toEqual(source.getJSON());

    source.destroy();
    loaded.destroy();
  });

  it('exports to Markdown as a heading and paragraph per card', () => {
    const editor = createEditor(CARD_GRID_DOC, [TestEntityMention]);

    const markdown = editor.getMarkdown();

    expect(markdown).toContain('#### Explore');
    expect(markdown).toContain('Discover haunting environments filled with secrets.');
    expect(markdown).toContain('@Scavenge');

    editor.destroy();
  });

  it('exports to HTML as a data-tagged grid of icon-tagged cards', () => {
    const editor = createEditor(CARD_GRID_DOC, [TestEntityMention]);

    const html = editor.getHTML();

    expect(html).toContain('data-type="cardGrid"');
    expect(html).toContain('data-type="card"');
    expect(html).toContain('data-icon="star"');
    expect(html).toContain('data-icon="idea"');
    expect(html).toContain('Explore');
    expect(html).toContain('Discover haunting environments filled with secrets.');

    editor.destroy();
  });
});
