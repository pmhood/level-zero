import { Editor, Node, type JSONContent } from '@tiptap/core';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AI_EDIT_ACTIONS } from './ai-actions';
import { AiEditingLayer } from './ai-editing-layer';
import {
  AiSuggestion,
  aiSuggestionRange,
  applyAiSuggestion,
  droppedReferences,
  rangeReferences,
  rangeText,
  setAiSuggestionRange,
  suggestionContent,
  textRunSelection,
} from './ai-suggestion';
import { createEditorExtensions } from './editor-extensions';
import {
  useAiSuggestion,
  type AiEditingOptions,
  type AiSuggestionRequest,
} from './use-ai-suggestion';

/**
 * A stand-in for the entity mention `apps/web` registers: an inline atom that
 * reads as `@Name`. The editor only ever knows it as "an inline atom with a
 * text form", which is exactly what a rewrite has to survive.
 */
const TestMention = Node.create({
  name: 'entityMention',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({ entityId: { default: null }, label: { default: null } }),
  parseHTML: () => [{ tag: 'span[data-mention]' }],
  renderHTML: () => ['span', { 'data-mention': '' }],
  renderText: ({ node }) => `@${node.attrs.label}`,
});

const KAEL = {
  type: 'entityMention',
  attrs: { entityId: 'ent_kael', label: 'Kael Voss' },
};

/** `The diver <@Kael Voss> holds their breath.` in one paragraph. */
function documentWithMention(): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'The diver ' },
          KAEL,
          { type: 'text', text: ' holds their breath.' },
        ],
      },
    ],
  };
}

function createEditor(content: JSONContent): Editor {
  return new Editor({
    extensions: [
      ...createEditorExtensions({ placeholder: 'Write…', slashMenu: false }),
      AiSuggestion,
      TestMention,
    ],
    content,
  });
}

/** The whole first paragraph, mention included. */
function paragraphRange(editor: Editor) {
  const paragraph = editor.state.doc.firstChild;
  if (!paragraph) throw new Error('the test document has no paragraph');
  return { from: 1, to: 1 + paragraph.content.size };
}

const editors: Editor[] = [];

function editorFor(content: JSONContent): Editor {
  const editor = createEditor(content);
  editors.push(editor);
  return editor;
}

afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
  vi.useRealTimers();
});

describe('reading the passage a suggestion is about', () => {
  it('sends a mention to the model as the words it shows', () => {
    const editor = editorFor(documentWithMention());

    expect(rangeText(editor, paragraphRange(editor))).toBe(
      'The diver @Kael Voss holds their breath.',
    );
  });

  it('collects the mentions inside the passage with the nodes they came from', () => {
    const editor = editorFor(documentWithMention());

    expect(rangeReferences(editor, paragraphRange(editor))).toEqual([
      { token: '@Kael Voss', node: KAEL },
    ]);
  });
});

describe('textRunSelection', () => {
  const twoParagraphs: JSONContent = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Explore the wreck.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Scavenge what is left.' }] },
    ],
  };

  it('offers a run of text inside one block', () => {
    const editor = editorFor(documentWithMention());
    editor.commands.setTextSelection({ from: 1, to: 5 });

    expect(textRunSelection(editor)).toEqual({ from: 1, to: 5 });
  });

  it('offers nothing for an empty selection', () => {
    const editor = editorFor(documentWithMention());
    editor.commands.setTextSelection(2);

    expect(textRunSelection(editor)).toBeNull();
  });

  it('offers nothing across block boundaries, so no block can be swallowed', () => {
    const editor = editorFor(twoParagraphs);
    editor.commands.setTextSelection({ from: 2, to: editor.state.doc.content.size - 2 });

    expect(textRunSelection(editor)).toBeNull();
  });
});

describe('suggestionContent', () => {
  it('rebuilds a mention the model kept, attributes and all', () => {
    const content = suggestionContent('@Kael Voss surfaces.', [
      { token: '@Kael Voss', node: KAEL },
    ]);

    expect(content).toEqual([KAEL, { type: 'text', text: ' surfaces.' }]);
  });

  it('keeps a suggestion inline, so it cannot restructure the document around it', () => {
    expect(suggestionContent('First line\nSecond line', [])).toEqual([
      { type: 'text', text: 'First line' },
      { type: 'hardBreak' },
      { type: 'text', text: 'Second line' },
    ]);
  });

  it('never emits an empty text node', () => {
    expect(suggestionContent('@Kael Voss', [{ token: '@Kael Voss', node: KAEL }])).toEqual([KAEL]);
  });

  it('reports the references a suggestion dropped', () => {
    const references = [{ token: '@Kael Voss', node: KAEL }];

    expect(droppedReferences('The diver holds their breath.', references)).toEqual(references);
    expect(droppedReferences('@Kael Voss holds their breath.', references)).toEqual([]);
  });
});

describe('a pending suggestion', () => {
  it('is not in the document, so autosave never sees it', () => {
    const editor = editorFor(documentWithMention());
    const before = editor.getJSON();

    setAiSuggestionRange(editor, paragraphRange(editor));

    expect(editor.getJSON()).toEqual(before);
    expect(JSON.stringify(editor.getJSON())).not.toContain('lz-ai-target');
  });

  it('follows its passage when the writer edits elsewhere', () => {
    const editor = editorFor(documentWithMention());
    const range = paragraphRange(editor);
    setAiSuggestionRange(editor, range);

    editor.commands.insertContentAt(1, 'Meanwhile: ');

    expect(aiSuggestionRange(editor.state)).toEqual({
      from: range.from + 'Meanwhile: '.length,
      to: range.to + 'Meanwhile: '.length,
    });
  });

  it('is withdrawn when the passage it was about is deleted', () => {
    const editor = editorFor(documentWithMention());
    const range = paragraphRange(editor);
    setAiSuggestionRange(editor, range);

    editor.commands.deleteRange(range);

    expect(aiSuggestionRange(editor.state)).toBeNull();
  });
});

describe('accepting a suggestion', () => {
  it('replaces the passage in one transaction that a single undo reverses', () => {
    const editor = editorFor(documentWithMention());
    const before = editor.getJSON();
    const range = paragraphRange(editor);

    let transactions = 0;
    editor.on('transaction', () => (transactions += 1));

    applyAiSuggestion(
      editor,
      range,
      suggestionContent('@Kael Voss surfaces.', [{ token: '@Kael Voss', node: KAEL }]),
    );

    expect(editor.getText()).toBe('@Kael Voss surfaces.');
    expect(transactions).toBe(1);

    editor.commands.undo();
    expect(editor.getJSON()).toEqual(before);
  });

  it('does not swallow what the writer typed just before accepting', () => {
    const editor = editorFor(documentWithMention());
    const range = paragraphRange(editor);

    editor.commands.insertContentAt(range.to, ' Then he dives.');
    const typed = editor.getJSON();

    applyAiSuggestion(editor, range, suggestionContent('Rewritten.', []));
    expect(editor.getText()).toBe('Rewritten. Then he dives.');

    // One undo takes back the accepted edit and nothing else.
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(typed);
  });

  it('keeps a mention structurally valid through a rewrite', () => {
    const editor = editorFor(documentWithMention());

    applyAiSuggestion(
      editor,
      paragraphRange(editor),
      suggestionContent('Breath held, @Kael Voss drops into the dark.', [
        { token: '@Kael Voss', node: KAEL },
      ]),
    );

    const paragraph = editor.getJSON().content?.[0];
    expect(paragraph?.content).toEqual([
      { type: 'text', text: 'Breath held, ' },
      KAEL,
      { type: 'text', text: ' drops into the dark.' },
    ]);
  });
});

/** A `suggest` that records what it was asked, and answers when the test says so. */
function deferredSuggest() {
  const requests: AiSuggestionRequest[] = [];
  let settle: (value: { text: string }) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;

  const suggest = vi.fn((request: AiSuggestionRequest) => {
    requests.push(request);
    return new Promise<{ text: string }>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
  });

  return {
    suggest,
    requests,
    resolve: (text: string) => act(async () => settle({ text })),
    reject: (message: string) => act(async () => fail(new Error(message))),
  };
}

function renderAi(editor: Editor, options: AiEditingOptions) {
  return renderHook(() => useAiSuggestion(editor, options));
}

describe('useAiSuggestion', () => {
  const rewrite = AI_EDIT_ACTIONS[0]!;

  it('sends the passage and its references, then offers the answer', async () => {
    const editor = editorFor(documentWithMention());
    const { suggest, requests, resolve } = deferredSuggest();
    const { result } = renderAi(editor, { suggest });

    act(() => {
      editor.commands.setTextSelection(paragraphRange(editor));
    });
    act(() => result.current.runAction(rewrite));

    expect(suggest).toHaveBeenCalledOnce();
    expect(requests[0]).toMatchObject({
      action: 'rewrite',
      instruction: rewrite.instruction,
      selection: 'The diver @Kael Voss holds their breath.',
      references: [KAEL],
    });
    expect(result.current.pending?.status).toBe('loading');

    await resolve('@Kael Voss surfaces.');
    expect(result.current.pending?.status).toBe('ready');
    expect(result.current.pending?.text).toBe('@Kael Voss surfaces.');
  });

  it('leaves the document untouched when the writer rejects', async () => {
    const editor = editorFor(documentWithMention());
    const before = editor.getJSON();
    const { suggest, resolve } = deferredSuggest();
    const { result } = renderAi(editor, { suggest });

    act(() => {
      editor.commands.setTextSelection(paragraphRange(editor));
    });
    act(() => result.current.runAction(rewrite));
    await resolve('Something else entirely.');

    act(() => result.current.reject());

    expect(result.current.pending).toBeNull();
    expect(aiSuggestionRange(editor.state)).toBeNull();
    expect(editor.getJSON()).toEqual(before);
  });

  it('reports the accepted edit with the document it produced', async () => {
    const editor = editorFor(documentWithMention());
    const onAccept = vi.fn();
    const { suggest, resolve } = deferredSuggest();
    const { result } = renderAi(editor, { suggest, onAccept });

    act(() => {
      editor.commands.setTextSelection(paragraphRange(editor));
    });
    act(() => result.current.runAction(rewrite));
    await resolve('@Kael Voss surfaces.');
    act(() => result.current.accept());

    expect(onAccept).toHaveBeenCalledOnce();
    expect(onAccept.mock.calls[0]![0]).toMatchObject({
      action: 'rewrite',
      replaced: 'The diver @Kael Voss holds their breath.',
      accepted: '@Kael Voss surfaces.',
    });
    expect(onAccept.mock.calls[0]![0].content).toEqual(editor.getJSON());
    expect(result.current.pending).toBeNull();
  });

  it('refuses to accept a suggestion the writer has since edited over', async () => {
    const editor = editorFor(documentWithMention());
    const { suggest, resolve } = deferredSuggest();
    const { result } = renderAi(editor, { suggest });

    act(() => {
      editor.commands.setTextSelection(paragraphRange(editor));
    });
    act(() => result.current.runAction(rewrite));

    // The writer keeps working on the very passage that is in flight.
    act(() => {
      editor.commands.insertContentAt(2, 'wary ');
    });
    await resolve('@Kael Voss surfaces.');

    expect(result.current.stale).toBe(true);
    const edited = editor.getJSON();
    act(() => result.current.accept());
    expect(editor.getJSON()).toEqual(edited);
  });

  it('surfaces a failed request without touching the document', async () => {
    const editor = editorFor(documentWithMention());
    const before = editor.getJSON();
    const { suggest, reject } = deferredSuggest();
    const { result } = renderAi(editor, { suggest });

    act(() => {
      editor.commands.setTextSelection(paragraphRange(editor));
    });
    act(() => result.current.runAction(rewrite));
    await reject('The model is unavailable.');

    expect(result.current.pending?.status).toBe('error');
    expect(result.current.pending?.error).toBe('The model is unavailable.');
    expect(editor.getJSON()).toEqual(before);
  });

  it('treats an empty answer as a failure rather than an edit that deletes the passage', async () => {
    const editor = editorFor(documentWithMention());
    const { suggest, resolve } = deferredSuggest();
    const { result } = renderAi(editor, { suggest });

    act(() => {
      editor.commands.setTextSelection(paragraphRange(editor));
    });
    act(() => result.current.runAction(rewrite));
    await resolve('   ');

    expect(result.current.pending?.status).toBe('error');
  });

  it('asks again from the passage as it stands now', async () => {
    const editor = editorFor(documentWithMention());
    const { suggest, resolve } = deferredSuggest();
    const { result } = renderAi(editor, { suggest });

    act(() => {
      editor.commands.setTextSelection(paragraphRange(editor));
    });
    act(() => result.current.runAction(rewrite));
    await resolve('A first attempt.');
    act(() => result.current.retry());

    expect(suggest).toHaveBeenCalledTimes(2);
    expect(result.current.pending?.status).toBe('loading');
  });
});

describe('AiEditingLayer', () => {
  function renderLayer(editor: Editor, options: AiEditingOptions) {
    const containerRef = React.createRef<HTMLDivElement>();
    const openPromptRef = { current: () => undefined } as React.MutableRefObject<
      (instance: Editor, range: { from: number; to: number }) => void
    >;

    return render(
      <div ref={containerRef}>
        <AiEditingLayer
          editor={editor}
          options={options}
          containerRef={containerRef}
          openPromptRef={openPromptRef}
        />
      </div>,
    );
  }

  it('offers the AI actions for a selected passage', async () => {
    const editor = editorFor(documentWithMention());
    renderLayer(editor, { suggest: vi.fn() });

    act(() => {
      editor.commands.setTextSelection(paragraphRange(editor));
    });

    await screen.findByRole('menu', { name: 'AI actions' });
    for (const action of AI_EDIT_ACTIONS) {
      expect(screen.getByRole('menuitem', { name: new RegExp(action.label) })).toBeDefined();
    }
  });

  it('previews the answer, then accepts it on one click', async () => {
    const editor = editorFor(documentWithMention());
    const { suggest, resolve } = deferredSuggest();
    renderLayer(editor, { suggest });

    act(() => {
      editor.commands.setTextSelection(paragraphRange(editor));
    });
    const rewrite = await screen.findByRole('menuitem', { name: /Rewrite/ });
    act(() => rewrite.click());

    await screen.findByText('Reading the project…');
    await resolve('@Kael Voss surfaces.');

    await screen.findByText('@Kael Voss surfaces.');
    expect(editor.getText()).toBe('The diver @Kael Voss holds their breath.');

    act(() => screen.getByRole('button', { name: 'Accept' }).click());

    await waitFor(() => expect(editor.getText()).toBe('@Kael Voss surfaces.'));
  });

  it('warns when accepting would drop a reference', async () => {
    const editor = editorFor(documentWithMention());
    const { suggest, resolve } = deferredSuggest();
    renderLayer(editor, { suggest });

    act(() => {
      editor.commands.setTextSelection(paragraphRange(editor));
    });
    const rewrite = await screen.findByRole('menuitem', { name: /Rewrite/ });
    act(() => rewrite.click());
    await resolve('The diver holds their breath.');

    await screen.findByText(/Accepting removes the reference @Kael Voss/);
  });

  it('offers only a way out once the passage is gone', async () => {
    const editor = editorFor(documentWithMention());
    const { suggest, resolve } = deferredSuggest();
    renderLayer(editor, { suggest });

    const range = paragraphRange(editor);
    act(() => {
      editor.commands.setTextSelection(range);
    });
    const rewrite = await screen.findByRole('menuitem', { name: /Rewrite/ });
    act(() => rewrite.click());
    await resolve('@Kael Voss surfaces.');

    act(() => {
      editor.commands.deleteRange(range);
    });

    await screen.findByText('The passage this was about is no longer in the document.');
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDefined();
  });
});
