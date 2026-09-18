import { documentPlainText, type DocumentContent } from '@level-zero/domain';
import { Editor, type JSONContent } from '@tiptap/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { CALLOUT_BODY_NODE, CALLOUT_NODE, CALLOUT_TITLE_NODE, insertCallout } from './callout';
import { createEditorExtensions } from './editor-extensions';
import {
  PULL_QUOTE_ATTRIBUTION_NODE,
  PULL_QUOTE_NODE,
  PULL_QUOTE_TEXT_NODE,
  insertPullQuote,
} from './pull-quote';
import { RichTextEditor } from './rich-text-editor';
import { BASE_EDITOR_COMMANDS, matchEditorCommands } from './slash-menu';

/**
 * jsdom has no layout engine, so it doesn't implement `Range.getClientRects`
 * at all (unlike `getBoundingClientRect`, which it stubs). ProseMirror's
 * `scrollIntoView` — which `insertCallout`/`insertPullQuote` call after
 * inserting, same as `insertSection` — needs it to find the inserted node's
 * position on screen. Only the tests below that mount a real, attached
 * `RichTextEditor` (rather than a bare headless `Editor`) exercise that path.
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
});

/** Loads content the way `RichTextEditor` does: as the editor's initial document. */
function createEditor(content: JSONContent): Editor {
  return new Editor({
    extensions: createEditorExtensions({ placeholder: 'Write…', slashMenu: false }),
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

const NORTH_STAR_DOC = doc({
  type: CALLOUT_NODE,
  attrs: { variant: 'northStar' },
  content: [
    { type: CALLOUT_TITLE_NODE, content: [{ type: 'text', text: 'Design North Star' }] },
    {
      type: CALLOUT_BODY_NODE,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Not all ruins are silent.' }],
        },
      ],
    },
  ],
});

const NOTE_DOC = doc({
  type: CALLOUT_NODE,
  attrs: { variant: 'note' },
  content: [
    { type: CALLOUT_TITLE_NODE, content: [{ type: 'text', text: 'Design Note' }] },
    {
      type: CALLOUT_BODY_NODE,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Movement should feel weighty.' }],
        },
      ],
    },
  ],
});

const PULL_QUOTE_DOC = doc({
  type: PULL_QUOTE_NODE,
  content: [
    {
      type: PULL_QUOTE_TEXT_NODE,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Some things should stay buried.' }] },
      ],
    },
    {
      type: PULL_QUOTE_ATTRIBUTION_NODE,
      content: [{ type: 'text', text: 'Field journal' }],
    },
  ],
});

describe('Callout', () => {
  it('is offered from the slash menu, one command per variant', () => {
    expect(matchEditorCommands(BASE_EDITOR_COMMANDS, 'north').map((c) => c.id)).toEqual([
      'callout-northStar',
    ]);
    expect(matchEditorCommands(BASE_EDITOR_COMMANDS, 'design note').map((c) => c.id)).toEqual([
      'callout-note',
    ]);
  });

  it('inserts a North Star callout, replacing the /query, with the default title selected', () => {
    const editor = createEditor(
      doc({ type: 'paragraph', content: [{ type: 'text', text: '/north' }] }),
    );

    const command = BASE_EDITOR_COMMANDS.find((c) => c.id === 'callout-northStar');
    command?.run(editor, { from: 1, to: 7 });

    const [inserted] = editor.getJSON().content ?? [];
    expect(inserted).toEqual({
      type: CALLOUT_NODE,
      attrs: { variant: 'northStar' },
      content: [
        { type: CALLOUT_TITLE_NODE, content: [{ type: 'text', text: 'Design North Star' }] },
        { type: CALLOUT_BODY_NODE, content: [{ type: 'paragraph' }] },
      ],
    });

    // The default title sits selected, so typing replaces it immediately.
    expect(editor.state.selection.empty).toBe(false);
    const { from, to } = editor.state.selection;
    expect(editor.state.doc.textBetween(from, to)).toBe('Design North Star');

    editor.destroy();
  });

  it('inserts a Design Note callout from the toolbar at the caret', () => {
    const editor = createEditor(doc({ type: 'paragraph' }));

    insertCallout(editor, 'note');

    expect(nodeTypes(editor.getJSON())).toContain(CALLOUT_NODE);
    expect(editor.getText()).toContain('Design Note');

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

    await screen.findByRole('button', { name: 'Callout' });
    act(() => screen.getByRole('button', { name: 'Callout' }).click());

    await waitFor(() => {
      const [content] = handleChange.mock.calls.at(-1) ?? [];
      expect(nodeTypes(content as JSONContent)).toContain(CALLOUT_NODE);
    });
  });

  it('keeps the title editable as ordinary document content', () => {
    const editor = createEditor(NORTH_STAR_DOC);

    // Rename the title (real text, not an attribute).
    editor.commands.setTextSelection({ from: 2, to: 2 + 'Design North Star'.length });
    editor.commands.insertContent('Our Vision');
    expect(editor.getJSON().content?.[0]?.content?.[0]).toEqual({
      type: CALLOUT_TITLE_NODE,
      content: [{ type: 'text', text: 'Our Vision' }],
    });

    editor.destroy();
  });

  it('keeps the body editable as ordinary document content', () => {
    const editor = createEditor(NORTH_STAR_DOC);

    editor.commands.focus('end');
    editor.commands.insertContent(' Curiosity over combat.');
    expect(editor.getText()).toContain('Not all ruins are silent. Curiosity over combat.');

    editor.destroy();
  });

  it('is reachable by find-in-document: its content counts as document prose', () => {
    const content = NORTH_STAR_DOC as DocumentContent;
    expect(documentPlainText(content)).toContain('Design North Star');
    expect(documentPlainText(content)).toContain('Not all ruins are silent.');
  });

  it('survives a save/reload JSON round trip', () => {
    const source = createEditor(NORTH_STAR_DOC);

    const stored = JSON.parse(JSON.stringify(source.getJSON())) as JSONContent;
    const loaded = createEditor(stored);

    expect(loaded.getJSON()).toEqual(source.getJSON());

    source.destroy();
    loaded.destroy();
  });

  it('exports to Markdown as a readable alert-style blockquote', () => {
    const editor = createEditor(NORTH_STAR_DOC);

    const markdown = editor.getMarkdown();

    expect(markdown).toContain('> [!NORTH-STAR] Design North Star');
    expect(markdown).toContain('> Not all ruins are silent.');

    editor.destroy();
  });

  it('exports the Design Note variant with its own tag', () => {
    const editor = createEditor(NOTE_DOC);

    expect(editor.getMarkdown()).toContain('> [!NOTE] Design Note');

    editor.destroy();
  });

  it('exports to HTML as a titled, variant-tagged aside', () => {
    const editor = createEditor(NORTH_STAR_DOC);

    const html = editor.getHTML();

    expect(html).toContain('<aside');
    expect(html).toContain('data-type="callout"');
    expect(html).toContain('data-variant="northStar"');
    expect(html).toContain('Design North Star');
    expect(html).toContain('Not all ruins are silent.');

    editor.destroy();
  });
});

describe('PullQuote', () => {
  it('is offered from the slash menu', () => {
    expect(matchEditorCommands(BASE_EDITOR_COMMANDS, 'attribution').map((c) => c.id)).toEqual([
      'pull-quote',
    ]);
  });

  it('inserts an empty pull-quote, caret in the quote', () => {
    const editor = createEditor(
      doc({ type: 'paragraph', content: [{ type: 'text', text: '/quote' }] }),
    );

    const command = BASE_EDITOR_COMMANDS.find((c) => c.id === 'pull-quote');
    command?.run(editor, { from: 1, to: 7 });

    const [inserted] = editor.getJSON().content ?? [];
    expect(inserted).toEqual({
      type: PULL_QUOTE_NODE,
      content: [
        { type: PULL_QUOTE_TEXT_NODE, content: [{ type: 'paragraph' }] },
        { type: PULL_QUOTE_ATTRIBUTION_NODE },
      ],
    });
    expect(editor.state.selection.empty).toBe(true);

    editor.destroy();
  });

  it('inserts from the toolbar at the caret', () => {
    const editor = createEditor(doc({ type: 'paragraph' }));

    insertPullQuote(editor);

    expect(nodeTypes(editor.getJSON())).toContain(PULL_QUOTE_NODE);

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

    await screen.findByRole('button', { name: 'Pull-quote' });
    act(() => screen.getByRole('button', { name: 'Pull-quote' }).click());

    await waitFor(() => {
      const [content] = handleChange.mock.calls.at(-1) ?? [];
      expect(nodeTypes(content as JSONContent)).toContain(PULL_QUOTE_NODE);
    });
  });

  it('keeps the quote and the attribution editable as ordinary document content', () => {
    const editor = createEditor(PULL_QUOTE_DOC);

    expect(editor.getText()).toContain('Some things should stay buried.');
    expect(editor.getText()).toContain('Field journal');

    editor.destroy();
  });

  it('is reachable by find-in-document', () => {
    const content = PULL_QUOTE_DOC as DocumentContent;
    expect(documentPlainText(content)).toContain('Some things should stay buried.');
    expect(documentPlainText(content)).toContain('Field journal');
  });

  it('survives a save/reload JSON round trip', () => {
    const source = createEditor(PULL_QUOTE_DOC);

    const stored = JSON.parse(JSON.stringify(source.getJSON())) as JSONContent;
    const loaded = createEditor(stored);

    expect(loaded.getJSON()).toEqual(source.getJSON());

    source.destroy();
    loaded.destroy();
  });

  it('exports to Markdown as a blockquote with the attribution after an em dash', () => {
    const editor = createEditor(PULL_QUOTE_DOC);

    const markdown = editor.getMarkdown();

    expect(markdown).toContain('> Some things should stay buried.');
    expect(markdown).toContain('> — Field journal');

    editor.destroy();
  });

  it('exports to HTML as a figure with a blockquote and a figcaption', () => {
    const editor = createEditor(PULL_QUOTE_DOC);

    const html = editor.getHTML();

    expect(html).toContain('<figure');
    expect(html).toContain('data-type="pullQuote"');
    expect(html).toContain('<blockquote');
    expect(html).toContain('<figcaption');
    expect(html).toContain('Some things should stay buried.');
    expect(html).toContain('Field journal');

    editor.destroy();
  });
});
