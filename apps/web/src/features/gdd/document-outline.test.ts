import { describe, expect, it } from 'vitest';

import { documentOutline } from './document-outline';

function heading(level: number, text: string, sectionId?: string) {
  return {
    type: 'heading',
    attrs: { level, ...(sectionId === undefined ? {} : { sectionId }) },
    content: text ? [{ type: 'text', text }] : undefined,
  };
}

describe('documentOutline', () => {
  it('is empty for a document that has not been started', () => {
    expect(documentOutline(null)).toEqual({ sections: [], appendices: null });
  });

  it('numbers top-level sections in reading order', () => {
    const content = {
      type: 'doc',
      content: [heading(1, 'Vision'), heading(1, 'Core Loop'), heading(1, 'Setting')],
    };

    expect(documentOutline(content).sections.map((entry) => entry.number)).toEqual(['1', '2', '3']);
  });

  it('nests a lower-level heading under the section above it', () => {
    const content = {
      type: 'doc',
      content: [
        heading(1, 'Gameplay & Controls'),
        heading(2, 'Movement'),
        heading(2, 'Combat'),
        heading(3, 'Ranged'),
        heading(1, 'Progression'),
      ],
    };

    expect(documentOutline(content).sections.map((entry) => entry.number)).toEqual([
      '1',
      '1.1',
      '1.2',
      '1.2.1',
      '2',
    ]);
  });

  it('nests a heading under its nearest shallower ancestor when a level is skipped', () => {
    // h1 straight to h3, with no h2 in between: the outline nests by depth
    // rather than leaving a gap for the level that never appeared.
    const content = { type: 'doc', content: [heading(1, 'Systems'), heading(3, 'Inventory')] };

    expect(documentOutline(content).sections.map((entry) => entry.number)).toEqual(['1', '1.1']);
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

    expect(documentOutline(content).sections).toEqual([
      { id: null, level: 2, text: 'Oxygen management', number: '1' },
    ]);
  });

  it('keeps a heading that has not been titled yet, so the outline does not jump around', () => {
    const content = { type: 'doc', content: [heading(3, '')] };

    expect(documentOutline(content).sections).toEqual([
      { id: null, level: 3, text: '', number: '1' },
    ]);
  });

  it('carries the section id a heading has been given', () => {
    const content = { type: 'doc', content: [heading(1, 'Pillars', 'section-a')] };

    expect(documentOutline(content).sections).toEqual([
      { id: 'section-a', level: 1, text: 'Pillars', number: '1' },
    ]);
  });

  it('keeps a heading that has no id yet, so a legacy body still has an outline', () => {
    const content = { type: 'doc', content: [heading(1, 'Old')] };

    expect(documentOutline(content).sections).toEqual([
      { id: null, level: 1, text: 'Old', number: '1' },
    ]);
  });

  describe('appendices', () => {
    it('is null when the document has no Appendices heading', () => {
      const content = { type: 'doc', content: [heading(1, 'Vision')] };

      expect(documentOutline(content).appendices).toBeNull();
    });

    it('groups the run of top-level sections after "Appendices" and letters them', () => {
      const content = {
        type: 'doc',
        content: [
          heading(1, 'Vision', 'v'),
          heading(1, 'Core Loop', 'c'),
          heading(1, 'Appendices', 'app'),
          heading(1, 'References & Inspiration', 'a'),
          heading(1, 'Feature Backlog', 'b'),
          heading(1, 'Changelog', 'c2'),
        ],
      };

      const outline = documentOutline(content);

      expect(outline.sections.map((entry) => entry.number)).toEqual(['1', '2']);
      expect(outline.appendices).not.toBeNull();
      expect(outline.appendices?.heading).toEqual({
        id: 'app',
        level: 1,
        text: 'Appendices',
        number: '',
      });
      expect(outline.appendices?.sections).toEqual([
        { id: 'a', level: 1, text: 'References & Inspiration', number: 'A' },
        { id: 'b', level: 1, text: 'Feature Backlog', number: 'B' },
        { id: 'c2', level: 1, text: 'Changelog', number: 'C' },
      ]);
    });

    it('matches "Appendix" too, trimmed and case-insensitively', () => {
      const content = {
        type: 'doc',
        content: [heading(1, 'Vision'), heading(1, '  appendix  '), heading(1, 'Glossary')],
      };

      const outline = documentOutline(content);

      expect(outline.appendices?.heading.text).toBe('appendix');
      expect(outline.appendices?.sections.map((entry) => entry.number)).toEqual(['A']);
    });

    it('nests a subsection of an appendix under its letter', () => {
      const content = {
        type: 'doc',
        content: [
          heading(1, 'Appendices'),
          heading(1, 'References'),
          heading(2, 'Books'),
          heading(2, 'Games'),
        ],
      };

      const numbers = documentOutline(content).appendices?.sections.map((entry) => entry.number);
      expect(numbers).toEqual(['A', 'A.1', 'A.2']);
    });

    it('does not treat a nested "Appendices" heading as the start of the group', () => {
      // Only a *top-level* heading opens the group — one nested under another
      // section is prose, not a section boundary.
      const content = {
        type: 'doc',
        content: [heading(1, 'Notes'), heading(2, 'Appendices'), heading(1, 'Glossary')],
      };

      expect(documentOutline(content).appendices).toBeNull();
    });
  });
});
