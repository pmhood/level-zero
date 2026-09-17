import { DOCUMENT_SECTION_ID_ATTR } from '@level-zero/domain';
import { Editor, type JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { createEditorExtensions } from './editor-extensions';
import { activeSectionId } from './section-id';

/**
 * Loads content the way `RichTextEditor` does: as the editor's initial
 * document, then settled.
 *
 * TipTap emits `create` on a macrotask rather than inside the constructor, so
 * the pass that mints ids for a body loaded without any lands one tick after
 * the editor exists — which is what these tests wait for.
 */
async function createEditor(content: JSONContent, editable = true): Promise<Editor> {
  const editor = new Editor({
    extensions: createEditorExtensions({ placeholder: 'Write…', slashMenu: false }),
    content,
    editable,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return editor;
}

function heading(text: string, sectionId?: string): JSONContent {
  return {
    type: 'heading',
    attrs: {
      level: 1,
      ...(sectionId === undefined ? {} : { [DOCUMENT_SECTION_ID_ATTR]: sectionId }),
    },
    content: [{ type: 'text', text }],
  };
}

function paragraph(text: string): JSONContent {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function sectionIds(editor: Editor): (string | null)[] {
  return (editor.getJSON().content ?? [])
    .filter((node) => node.type === 'heading')
    .map((node) => (node.attrs?.[DOCUMENT_SECTION_ID_ATTR] as string | null) ?? null);
}

describe('SectionId', () => {
  it('mints ids for a body loaded without any', async () => {
    // ProseMirror runs `appendTransaction` for transactions, and loading a
    // document is not one — so without the extension's own pass on create, a
    // GDD written before section ids existed would open with nothing in it
    // addressable and a table of contents that could carry no status.
    const editor = await createEditor({
      type: 'doc',
      content: [heading('Vision'), paragraph('A haunting journey.'), heading('Core loop')],
    });

    const ids = sectionIds(editor);
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(2);
  });

  it('leaves the ids a body already carries exactly where they are', async () => {
    const editor = await createEditor({
      type: 'doc',
      content: [heading('Vision', 'section-a'), heading('Core loop', 'section-b')],
    });

    expect(sectionIds(editor)).toEqual(['section-a', 'section-b']);
  });

  it('mints nothing on a read-only surface, which has nowhere to save it', async () => {
    const editor = await createEditor({ type: 'doc', content: [heading('Vision')] }, false);

    expect(sectionIds(editor)).toEqual([null]);
  });

  it('mints an id for a heading typed after the document was loaded', async () => {
    const editor = await createEditor({ type: 'doc', content: [heading('Vision', 'section-a')] });

    editor.commands.insertContentAt(editor.state.doc.content.size, heading('Core loop'));

    const ids = sectionIds(editor);
    expect(ids[0]).toBe('section-a');
    expect(typeof ids[1]).toBe('string');
    expect(ids[1]).not.toBe('section-a');
  });

  it('re-mints a pasted duplicate, the first in reading order keeping the id', async () => {
    const editor = await createEditor({ type: 'doc', content: [heading('Vision', 'section-a')] });

    editor.commands.insertContentAt(editor.state.doc.content.size, heading('Vision', 'section-a'));

    const ids = sectionIds(editor);
    expect(ids[0]).toBe('section-a');
    expect(ids[1]).not.toBe('section-a');
    expect(typeof ids[1]).toBe('string');
  });

  it('keeps a section id through a rename, so what is anchored to it is untouched', async () => {
    const editor = await createEditor({
      type: 'doc',
      content: [heading('Core loop', 'section-a')],
    });

    editor.commands.setTextSelection({ from: 1, to: 10 });
    editor.commands.insertContent('The loop');

    expect(sectionIds(editor)).toEqual(['section-a']);
  });

  it('renders the id as data-section-id so a copy and paste keeps it', async () => {
    const editor = await createEditor({ type: 'doc', content: [heading('Vision', 'section-a')] });

    expect(editor.getHTML()).toContain('data-section-id="section-a"');
  });

  it('is not undone by the writer pressing undo', async () => {
    const editor = await createEditor({ type: 'doc', content: [heading('Vision')] });
    const minted = sectionIds(editor)[0];

    editor.commands.undo();

    expect(sectionIds(editor)).toEqual([minted]);
  });
});

describe('activeSectionId', () => {
  it('reads the section the caret sits in', async () => {
    const editor = await createEditor({
      type: 'doc',
      content: [
        heading('Vision', 'section-a'),
        paragraph('A haunting journey.'),
        heading('Core loop', 'section-b'),
        paragraph('Explore, scavenge, upgrade.'),
      ],
    });

    editor.commands.setTextSelection(editor.state.doc.content.size - 2);

    expect(activeSectionId(editor)).toBe('section-b');
  });

  it('is null before the document’s first heading', async () => {
    const editor = await createEditor({
      type: 'doc',
      content: [paragraph('An opening line.'), heading('Vision', 'section-a')],
    });

    editor.commands.setTextSelection(2);

    expect(activeSectionId(editor)).toBeNull();
  });
});
