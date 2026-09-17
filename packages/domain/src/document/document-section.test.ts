import { describe, expect, it } from 'vitest';

import { sequentialIdGenerator } from '../shared/id';
import { type DocumentContent } from './document';
import { DOCUMENT_SECTION_ID_ATTR, assignSectionIds, documentSections } from './document-section';

function heading(text: string, options: { level?: number; id?: string } = {}): unknown {
  return {
    type: 'heading',
    attrs: {
      level: options.level ?? 1,
      ...(options.id === undefined ? {} : { [DOCUMENT_SECTION_ID_ATTR]: options.id }),
    },
    content: [{ type: 'text', text }],
  };
}

function doc(...nodes: unknown[]): DocumentContent {
  return { type: 'doc', content: nodes };
}

const ids = () => sequentialIdGenerator('section');

describe('documentSections', () => {
  it('lists top-level headings with an id, in reading order', () => {
    const content = doc(
      heading('Vision', { id: 'a' }),
      { type: 'paragraph', content: [{ type: 'text', text: 'A haunting journey.' }] },
      heading('Core loop', { level: 2, id: 'b' }),
    );

    expect(documentSections(content)).toEqual([
      { id: 'a', level: 1, text: 'Vision' },
      { id: 'b', level: 2, text: 'Core loop' },
    ]);
  });

  it('joins a heading split across marks into one title', () => {
    const content = doc({
      type: 'heading',
      attrs: { level: 2, [DOCUMENT_SECTION_ID_ATTR]: 'a' },
      content: [
        { type: 'text', text: 'Oxygen ' },
        { type: 'text', marks: [{ type: 'italic' }], text: 'management' },
      ],
    });

    expect(documentSections(content)).toEqual([{ id: 'a', level: 2, text: 'Oxygen management' }]);
  });

  it('skips a heading that has no id: nothing can be anchored to it', () => {
    const content = doc(heading('Vision'), heading('Core loop', { id: 'b' }));

    expect(documentSections(content).map((section) => section.id)).toEqual(['b']);
  });

  it('is not fooled by a heading inside a blockquote, which is prose', () => {
    const content = doc({
      type: 'blockquote',
      content: [heading('Not a section', { id: 'a' })],
    });

    expect(documentSections(content)).toEqual([]);
  });

  it('is empty for a document that has not been started', () => {
    expect(documentSections({ type: 'doc', content: [] })).toEqual([]);
    expect(documentSections({ type: 'doc' })).toEqual([]);
  });
});

describe('assignSectionIds', () => {
  it('mints an id for every heading that has none', () => {
    const assigned = assignSectionIds(doc(heading('Vision'), heading('Core loop')), ids());

    expect(documentSections(assigned).map((section) => section.id)).toEqual([
      'section-1',
      'section-2',
    ]);
  });

  it('returns the content unchanged when there is nothing to mint', () => {
    const content = doc(heading('Vision', { id: 'a' }));

    expect(assignSectionIds(content, ids())).toBe(content);
  });

  it('re-mints a duplicate, the first in reading order keeping the id', () => {
    const assigned = assignSectionIds(
      doc(heading('Vision', { id: 'a' }), heading('Vision', { id: 'a' })),
      ids(),
    );

    expect(documentSections(assigned).map((section) => section.id)).toEqual(['a', 'section-1']);
  });

  it('leaves every other node, and every nested heading, alone', () => {
    const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'Explore.' }] };
    const quoted = { type: 'blockquote', content: [heading('Quoted')] };

    const content = doc(paragraph, quoted);
    const assigned = assignSectionIds(content, ids());

    expect(assigned).toBe(content);
  });

  it('keeps a heading’s other attributes when it mints one', () => {
    const assigned = assignSectionIds(doc(heading('Core loop', { level: 3 })), ids());

    expect(documentSections(assigned)).toEqual([{ id: 'section-1', level: 3, text: 'Core loop' }]);
  });
});
