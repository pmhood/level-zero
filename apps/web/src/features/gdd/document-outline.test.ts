import { describe, expect, it } from 'vitest';

import { documentOutline } from './document-outline';

describe('documentOutline', () => {
  it('is empty for a document that has not been started', () => {
    expect(documentOutline(null)).toEqual([]);
  });

  it('lists headings in reading order with their level', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Pillars' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Tension comes from oxygen.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Core loop' }] },
      ],
    };

    expect(documentOutline(content)).toEqual([
      { id: null, level: 1, text: 'Pillars' },
      { id: null, level: 2, text: 'Core loop' },
    ]);
  });

  it('joins a heading split across marks into one entry', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [
            { type: 'text', text: 'Oxygen ' },
            { type: 'text', marks: [{ type: 'italic' }], text: 'management' },
          ],
        },
      ],
    };

    expect(documentOutline(content)).toEqual([{ id: null, level: 2, text: 'Oxygen management' }]);
  });

  it('keeps a heading that has not been titled yet', () => {
    const content = { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 } }] };

    expect(documentOutline(content)).toEqual([{ id: null, level: 3, text: '' }]);
  });

  it('carries the section id a heading has been given', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1, sectionId: 'section-a' },
          content: [{ type: 'text', text: 'Pillars' }],
        },
      ],
    };

    expect(documentOutline(content)).toEqual([{ id: 'section-a', level: 1, text: 'Pillars' }]);
  });

  it('keeps a heading that has no id yet, so a legacy body still has an outline', () => {
    // A document written before section ids existed has none until the editor
    // opens it and mints them. Dropping those headings would leave every
    // pre-existing GDD with a blank table of contents.
    const content = {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Old' }] }],
    };

    expect(documentOutline(content)).toEqual([{ id: null, level: 1, text: 'Old' }]);
  });
});
