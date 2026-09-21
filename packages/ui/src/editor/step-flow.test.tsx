import { documentPlainText, type DocumentContent } from '@level-zero/domain';
import { Editor, Node, type JSONContent } from '@tiptap/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createEditorExtensions } from './editor-extensions';
import { RichTextEditor } from './rich-text-editor';
import { BASE_EDITOR_COMMANDS, matchEditorCommands } from './slash-menu';
import {
  STEP_FLOW_NODE,
  STEP_FLOW_STEP_BODY_NODE,
  STEP_FLOW_STEP_NODE,
  STEP_FLOW_STEP_TITLE_NODE,
  insertStepFlow,
} from './step-flow';

/**
 * jsdom stubs, same reasoning as `callout-pull-quote.test.tsx`:
 * `insertStepFlow` (and the "Add step" control) call `scrollIntoView`, which
 * throws from inside TipTap's deferred call when `getClientRects` yields no
 * usable rect — an uncaught exception that fails the run from a mounted,
 * attached `RichTextEditor` on a slow enough host.
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
 * A stand-in for the entity mention `apps/web` registers (same as
 * `ai-editing.test.tsx`'s `TestMention`): an inline atom the editor only
 * ever knows as "an inline atom with a text and markdown form". `archived`
 * mimics the honesty `EntityMentionView` renders for an archived entity,
 * without this package learning what an entity or an archived status is.
 */
const TestMention = Node.create({
  name: 'entityMention',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({
    entityId: { default: null },
    label: { default: null },
    archived: { default: false },
  }),
  parseHTML: () => [{ tag: 'span[data-mention]' }],
  renderHTML: () => ['span', { 'data-mention': '' }],
  renderText: ({ node }) =>
    node.attrs.archived ? `@${node.attrs.label} (archived)` : `@${node.attrs.label}`,
  renderMarkdown: (node) =>
    node.attrs?.archived ? `@${node.attrs.label} (archived)` : `@${node.attrs?.label}`,
});

function mention(label: string, archived = false): JSONContent {
  return { type: 'entityMention', attrs: { entityId: `ent_${label}`, label, archived } };
}

/** Loads content the way `RichTextEditor` does: as the editor's initial document. */
function createEditor(content: JSONContent): Editor {
  return new Editor({
    extensions: [
      ...createEditorExtensions({ placeholder: 'Write…', slashMenu: false }),
      TestMention,
    ],
    content,
  });
}

function doc(...content: JSONContent[]): JSONContent {
  return { type: 'doc', content };
}

function step(title: string, ...bodyContent: JSONContent[]): JSONContent {
  return {
    type: STEP_FLOW_STEP_NODE,
    content: [
      { type: STEP_FLOW_STEP_TITLE_NODE, content: [{ type: 'text', text: title }] },
      {
        type: STEP_FLOW_STEP_BODY_NODE,
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

/** The titles of every step in a `stepFlow` doc, in document order. */
function stepTitles(content: JSONContent): string[] {
  const [flow] = content.content ?? [];
  return (flow?.content ?? []).map((s) => {
    const title = s.content?.find((c) => c.type === STEP_FLOW_STEP_TITLE_NODE);
    return title?.content?.map((t) => t.text ?? '').join('') ?? '';
  });
}

const CORE_LOOP_DOC = doc({
  type: STEP_FLOW_NODE,
  content: [
    step('Explore', paragraph('Dive into new areas.')),
    step('Salvage', paragraph('Collect resources.')),
  ],
});

describe('StepFlow', () => {
  it('is offered from the slash menu', () => {
    expect(matchEditorCommands(BASE_EDITOR_COMMANDS, 'step flow').map((c) => c.id)).toEqual([
      'step-flow',
    ]);
    expect(matchEditorCommands(BASE_EDITOR_COMMANDS, 'core loop').map((c) => c.id)).toEqual([
      'step-flow',
    ]);
  });

  it('inserts a two-step flow, replacing the /query, with the first title selected', () => {
    const editor = createEditor(
      doc({ type: 'paragraph', content: [{ type: 'text', text: '/step' }] }),
    );

    const command = BASE_EDITOR_COMMANDS.find((c) => c.id === 'step-flow');
    command?.run(editor, { from: 1, to: 6 });

    const [inserted] = editor.getJSON().content ?? [];
    expect(inserted?.type).toBe(STEP_FLOW_NODE);
    expect(stepTitles(editor.getJSON())).toEqual(['Step 1', 'Step 2']);

    expect(editor.state.selection.empty).toBe(false);
    const { from, to } = editor.state.selection;
    expect(editor.state.doc.textBetween(from, to)).toBe('Step 1');

    editor.destroy();
  });

  it('inserts from the toolbar at the caret', () => {
    const editor = createEditor(doc({ type: 'paragraph' }));

    insertStepFlow(editor);

    expect(nodeTypes(editor.getJSON())).toContain(STEP_FLOW_NODE);
    expect(stepTitles(editor.getJSON())).toEqual(['Step 1', 'Step 2']);

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

    await screen.findByRole('button', { name: 'Step flow' });
    act(() => screen.getByRole('button', { name: 'Step flow' }).click());

    await waitFor(() => {
      const [content] = handleChange.mock.calls.at(-1) ?? [];
      expect(nodeTypes(content as JSONContent)).toContain(STEP_FLOW_NODE);
    });
  });

  it('keeps a step’s title editable as ordinary document content', () => {
    const editor = createEditor(CORE_LOOP_DOC);

    editor.commands.setTextSelection({ from: 3, to: 3 + 'Explore'.length });
    editor.commands.insertContent('Scout');
    expect(stepTitles(editor.getJSON())).toEqual(['Scout', 'Salvage']);

    editor.destroy();
  });

  it('keeps a step’s body editable as ordinary document content', () => {
    const editor = createEditor(CORE_LOOP_DOC);

    editor.commands.focus('end');
    editor.commands.insertContent(' Scan and discover.');
    expect(editor.getText()).toContain('Collect resources. Scan and discover.');

    editor.destroy();
  });

  it('is reachable by find-in-document: its content counts as document prose', () => {
    const content = CORE_LOOP_DOC as DocumentContent;
    expect(documentPlainText(content)).toContain('Explore');
    expect(documentPlainText(content)).toContain('Dive into new areas.');
  });

  it('survives a save/reload JSON round trip', () => {
    const source = createEditor(CORE_LOOP_DOC);

    const stored = JSON.parse(JSON.stringify(source.getJSON())) as JSONContent;
    const loaded = createEditor(stored);

    expect(loaded.getJSON()).toEqual(source.getJSON());

    source.destroy();
    loaded.destroy();
  });

  describe('reordering and removing steps', () => {
    function renderFlow(content: JSONContent) {
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

    const THREE_STEPS = doc({
      type: STEP_FLOW_NODE,
      content: [step('Explore'), step('Salvage'), step('Upgrade')],
    });

    it('adds a step at the end, in place', async () => {
      const handleChange = renderFlow(CORE_LOOP_DOC);

      const addButton = await screen.findByRole('button', { name: 'Add step' });
      act(() => addButton.click());

      await waitFor(() => {
        const [content] = handleChange.mock.calls.at(-1) ?? [];
        expect(stepTitles(content as JSONContent)).toEqual(['Explore', 'Salvage', 'Step 3']);
      });
    });

    it('disables moving the first step earlier and the last step later', async () => {
      renderFlow(THREE_STEPS);

      const earlierButtons = await screen.findAllByRole('button', { name: 'Move step earlier' });
      const laterButtons = await screen.findAllByRole('button', { name: 'Move step later' });

      expect((earlierButtons[0] as HTMLButtonElement).disabled).toBe(true);
      expect((laterButtons.at(-1) as HTMLButtonElement).disabled).toBe(true);
      expect((laterButtons[0] as HTMLButtonElement).disabled).toBe(false);
      expect((earlierButtons.at(-1) as HTMLButtonElement).disabled).toBe(false);
    });

    it('moves a step later, and the rendered order matches the model', async () => {
      const handleChange = renderFlow(THREE_STEPS);

      const laterButtons = await screen.findAllByRole('button', { name: 'Move step later' });
      act(() => laterButtons[0]!.click());

      await waitFor(() => {
        const [content] = handleChange.mock.calls.at(-1) ?? [];
        expect(stepTitles(content as JSONContent)).toEqual(['Salvage', 'Explore', 'Upgrade']);
      });
    });

    it('moves a step earlier', async () => {
      const handleChange = renderFlow(THREE_STEPS);

      const earlierButtons = await screen.findAllByRole('button', { name: 'Move step earlier' });
      act(() => earlierButtons.at(-1)!.click());

      await waitFor(() => {
        const [content] = handleChange.mock.calls.at(-1) ?? [];
        expect(stepTitles(content as JSONContent)).toEqual(['Explore', 'Upgrade', 'Salvage']);
      });
    });

    it('removes a step in place, keeping the others', async () => {
      const handleChange = renderFlow(THREE_STEPS);

      const removeButtons = await screen.findAllByRole('button', { name: 'Remove step' });
      act(() => removeButtons[1]!.click());

      await waitFor(() => {
        const [content] = handleChange.mock.calls.at(-1) ?? [];
        expect(stepTitles(content as JSONContent)).toEqual(['Explore', 'Upgrade']);
      });
    });

    it('will not remove the last remaining step', async () => {
      renderFlow(doc({ type: STEP_FLOW_NODE, content: [step('Only step')] }));

      const removeButton = await screen.findByRole('button', { name: 'Remove step' });
      expect((removeButton as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('an entity reference inside a step', () => {
    it('is written and read back like any other inline content', () => {
      const withMention = doc({
        type: STEP_FLOW_NODE,
        content: [
          step('Upgrade', {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Improve the ' }, mention('Oxygen Management')],
          }),
        ],
      });

      const editor = createEditor(withMention);
      expect(nodeTypes(editor.getJSON())).toContain('entityMention');
      expect(editor.getText()).toContain('@Oxygen Management');

      editor.destroy();
    });

    it('renders an archived entity honestly rather than breaking the block', () => {
      const withArchivedMention = doc({
        type: STEP_FLOW_NODE,
        content: [
          step('Explore', paragraph('Dive into new areas.')),
          step('Upgrade', {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Improve the ' }, mention('Old Rig', true)],
          }),
        ],
      });

      const editor = createEditor(withArchivedMention);

      // The reference is honest about the archived status…
      expect(editor.getMarkdown()).toContain('@Old Rig (archived)');
      // …and the rest of the block is untouched.
      expect(stepTitles(editor.getJSON())).toEqual(['Explore', 'Upgrade']);
      expect(editor.getText()).toContain('Dive into new areas.');

      editor.destroy();
    });
  });

  describe('an optional image', () => {
    it('survives a save/reload round trip alongside the title and body', () => {
      const withImage = doc({
        type: STEP_FLOW_NODE,
        content: [
          {
            type: STEP_FLOW_STEP_NODE,
            content: [
              { type: 'image', attrs: { src: 'https://example.com/explore.png', alt: 'Explore' } },
              { type: STEP_FLOW_STEP_TITLE_NODE, content: [{ type: 'text', text: 'Explore' }] },
              {
                type: STEP_FLOW_STEP_BODY_NODE,
                content: [paragraph('Dive into new areas.')],
              },
            ],
          },
        ],
      });

      const source = createEditor(withImage);
      const stored = JSON.parse(JSON.stringify(source.getJSON())) as JSONContent;
      const loaded = createEditor(stored);

      expect(loaded.getJSON()).toEqual(source.getJSON());
      expect(nodeTypes(source.getJSON())).toContain('image');

      source.destroy();
      loaded.destroy();
    });
  });

  describe('export', () => {
    it('exports to Markdown as a numbered sequence, not arrow glyphs', () => {
      const editor = createEditor(CORE_LOOP_DOC);

      const markdown = editor.getMarkdown();

      expect(markdown).toContain('1. **Explore**');
      expect(markdown).toContain('2. **Salvage**');
      expect(markdown).toContain('Dive into new areas.');
      expect(markdown).not.toContain('→');

      editor.destroy();
    });

    it('exports to HTML as an ordered list of steps', () => {
      const editor = createEditor(CORE_LOOP_DOC);

      const html = editor.getHTML();

      expect(html).toContain('<ol');
      expect(html).toContain('data-type="stepFlow"');
      expect(html).toContain('<li');
      expect(html).toContain('data-type="stepFlowStep"');
      expect(html).toContain('Explore');
      expect(html).toContain('Dive into new areas.');

      editor.destroy();
    });
  });
});
