import { describe, expect, it } from 'vitest';

import { type DocumentContent } from '../document/document';
import { documentDifferences } from './document-differences';

function paragraph(text: string): Record<string, unknown> {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function heading(text: string): Record<string, unknown> {
  return { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] };
}

function doc(...blocks: Record<string, unknown>[]): DocumentContent {
  return { type: 'doc', content: blocks };
}

describe('document differences', () => {
  it('reads a rewritten paragraph as the prose either side of it', () => {
    const before = doc(heading('Core loop'), paragraph('Oxygen drains twice as fast.'));
    const after = doc(heading('Core loop'), paragraph('Oxygen drains three times as fast.'));

    expect(documentDifferences(before, after)).toEqual([
      {
        key: '0',
        label: 'Paragraph',
        change: 'changed',
        from: 'Oxygen drains twice as fast.',
        to: 'Oxygen drains three times as fast.',
      },
    ]);
  });

  it('leaves untouched paragraphs alone when one is inserted between them', () => {
    const before = doc(paragraph('One.'), paragraph('Three.'));
    const after = doc(paragraph('One.'), paragraph('Two.'), paragraph('Three.'));

    expect(documentDifferences(before, after)).toEqual([
      { key: '0', label: 'Paragraph', change: 'added', from: null, to: 'Two.' },
    ]);
  });

  it('reports a deletion', () => {
    const before = doc(paragraph('One.'), paragraph('Two.'));
    const after = doc(paragraph('One.'));

    expect(documentDifferences(before, after)).toEqual([
      { key: '0', label: 'Paragraph', change: 'removed', from: 'Two.', to: null },
    ]);
  });

  it('names the kind of block that changed', () => {
    const before = doc(heading('Core loop'));
    const after = doc(heading('The core loop'));

    expect(documentDifferences(before, after)[0]).toMatchObject({
      label: 'Heading',
      from: 'Core loop',
      to: 'The core loop',
    });
  });

  it('collects the words of a nested block, whatever holds them', () => {
    const list = {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [paragraph('Dive')] },
        { type: 'listItem', content: [paragraph('Surface')] },
      ],
    };

    expect(documentDifferences(doc(), doc(list))).toEqual([
      { key: '0', label: 'Bulleted list', change: 'added', from: null, to: 'Dive Surface' },
    ]);
  });

  /**
   * The whole point of comparing blocks rather than serialized JSON: the
   * editor rewrites attributes on its own, and a writer must not be told the
   * document changed because a mark gained a default.
   */
  it('says nothing when the prose is the same and only the stored shape moved', () => {
    const before = doc({ type: 'paragraph', content: [{ type: 'text', text: 'Dive deeper.' }] });
    const after = doc({
      type: 'paragraph',
      attrs: { textAlign: null },
      content: [{ type: 'text', marks: [], text: 'Dive deeper.' }],
    });

    expect(documentDifferences(before, after)).toEqual([]);
    expect(JSON.stringify(before) === JSON.stringify(after)).toBe(false);
  });

  it('compares an empty document with one that has been written', () => {
    expect(documentDifferences({ type: 'doc' }, doc(paragraph('First words.')))).toEqual([
      { key: '0', label: 'Paragraph', change: 'added', from: null, to: 'First words.' },
    ]);
  });
});
