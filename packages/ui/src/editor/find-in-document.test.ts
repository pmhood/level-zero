import { Editor, type JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { createEditorExtensions } from './editor-extensions';
import { findInDocumentState, setFindQuery, stepFindMatch } from './find-in-document';

/** Loads content the way `RichTextEditor` does: as the editor's initial document. */
function createEditor(content: JSONContent): Editor {
  return new Editor({
    extensions: createEditorExtensions({ placeholder: 'Write…', slashMenu: false }),
    content,
  });
}

function paragraph(text: string): JSONContent {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function heading(text: string): JSONContent {
  return { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text }] };
}

describe('FindInDocument — match counting', () => {
  it('counts every occurrence, case-insensitively', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        paragraph('The Oxygen Meter tracks oxygen.'),
        paragraph('OXYGEN runs out at zero.'),
      ],
    });

    setFindQuery(editor, 'oxygen');

    expect(findInDocumentState(editor.state).matches).toHaveLength(3);
  });

  it('reports no matches for a query the document does not contain', () => {
    const editor = createEditor({ type: 'doc', content: [paragraph('A quiet moment.')] });

    setFindQuery(editor, 'dragon');

    const state = findInDocumentState(editor.state);
    expect(state.matches).toHaveLength(0);
    expect(state.activeIndex).toBe(-1);
  });

  it('reports nothing for an empty or blank query', () => {
    const editor = createEditor({ type: 'doc', content: [paragraph('oxygen oxygen oxygen')] });

    setFindQuery(editor, '   ');

    expect(findInDocumentState(editor.state).matches).toHaveLength(0);
  });

  it('finds matches wherever they sit in the document — headings, an early paragraph, and one far below', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        heading('Oxygen system'),
        paragraph('Text above.'),
        paragraph('Text below, far down the document, scrolled well out of view.'),
        paragraph('The tank holds oxygen.'),
      ],
    });

    setFindQuery(editor, 'oxygen');

    // The model is walked directly (`doc.descendants`), not the rendered
    // DOM, so a match past what is currently scrolled into view is found the
    // same way as one in the heading.
    expect(findInDocumentState(editor.state).matches).toHaveLength(2);
  });

  it('finds a match embedded inside a table cell', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [{ type: 'tableCell', content: [paragraph('Oxygen capacity')] }],
            },
          ],
        },
      ],
    });

    setFindQuery(editor, 'oxygen');

    expect(findInDocumentState(editor.state).matches).toHaveLength(1);
  });
});

describe('FindInDocument — navigation', () => {
  it('starts on the first match', () => {
    const editor = createEditor({ type: 'doc', content: [paragraph('One fish, two fish.')] });

    setFindQuery(editor, 'fish');

    expect(findInDocumentState(editor.state).activeIndex).toBe(0);
  });

  it('steps forward through matches and wraps back to the first', () => {
    const editor = createEditor({ type: 'doc', content: [paragraph('oxygen oxygen oxygen')] });

    setFindQuery(editor, 'oxygen');
    expect(findInDocumentState(editor.state).activeIndex).toBe(0);

    stepFindMatch(editor, 1);
    expect(findInDocumentState(editor.state).activeIndex).toBe(1);

    stepFindMatch(editor, 1);
    expect(findInDocumentState(editor.state).activeIndex).toBe(2);

    stepFindMatch(editor, 1);
    expect(findInDocumentState(editor.state).activeIndex).toBe(0);
  });

  it('steps backward through matches and wraps around to the last', () => {
    const editor = createEditor({ type: 'doc', content: [paragraph('oxygen oxygen oxygen')] });

    setFindQuery(editor, 'oxygen');
    stepFindMatch(editor, -1);

    expect(findInDocumentState(editor.state).activeIndex).toBe(2);
  });

  it('does nothing when there is nothing to step through', () => {
    const editor = createEditor({ type: 'doc', content: [paragraph('A quiet moment.')] });

    setFindQuery(editor, 'dragon');
    stepFindMatch(editor, 1);

    expect(findInDocumentState(editor.state).activeIndex).toBe(-1);
  });
});

describe('FindInDocument — the document is never touched', () => {
  it('never changes the document content', () => {
    const editor = createEditor({ type: 'doc', content: [paragraph('oxygen oxygen')] });
    const before = editor.getJSON();

    setFindQuery(editor, 'oxygen');
    stepFindMatch(editor, 1);
    stepFindMatch(editor, -1);
    setFindQuery(editor, 'nothing here');
    setFindQuery(editor, '');

    expect(editor.getJSON()).toEqual(before);
  });

  it('adds nothing to the undo history', () => {
    const editor = createEditor({ type: 'doc', content: [paragraph('oxygen')] });

    setFindQuery(editor, 'oxygen');
    stepFindMatch(editor, 1);

    expect(editor.can().undo()).toBe(false);
  });

  it('re-finds matches after an edit, following the text rather than a stale position', () => {
    const editor = createEditor({ type: 'doc', content: [paragraph('oxygen')] });

    setFindQuery(editor, 'oxygen');
    editor.commands.insertContentAt(1, 'low ');

    expect(editor.getText().trim()).toBe('low oxygen');
    expect(findInDocumentState(editor.state).matches).toHaveLength(1);
  });
});
