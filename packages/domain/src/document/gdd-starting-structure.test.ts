import { describe, expect, it } from 'vitest';

import { sequentialIdGenerator } from '../shared/id';
import { documentPlainText } from './document';
import { assignSectionIds, documentSections } from './document-section';
import { gddStartingStructureContent } from './gdd-starting-structure';

const SECTION_HEADINGS = [
  'High Concept',
  'Design Pillars',
  'Core Loop',
  'Mechanics',
  'World',
  'Characters',
  'Progression',
  'UI/UX',
  'Audio/Visual Direction',
  'Prototype / Playtest Notes',
];

describe('gddStartingStructureContent', () => {
  it('produces the sections #167 names, in order, each with guidance prose', () => {
    const content = gddStartingStructureContent();
    const nodes = content.content as Array<{ type: string; content?: Array<{ text?: string }> }>;

    const headings = nodes.filter((node) => node.type === 'heading');
    expect(headings.map((node) => node.content?.[0]?.text)).toEqual(SECTION_HEADINGS);

    const paragraphs = nodes.filter((node) => node.type === 'paragraph');
    expect(paragraphs).toHaveLength(SECTION_HEADINGS.length);
    for (const paragraph of paragraphs) {
      const text = paragraph.content?.[0]?.text ?? '';
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it('carries no sectionId and no entity reference — it is content, not schema', () => {
    const content = gddStartingStructureContent();

    expect(documentPlainText(content)).not.toMatch(/@/);
    for (const node of content.content as Array<{ attrs?: Record<string, unknown> }>) {
      expect(node.attrs?.sectionId).toBeUndefined();
      expect(node.attrs?.entityId).toBeUndefined();
    }
  });

  it('reads as ordinary sections once run through assignSectionIds, exactly like a hand-typed body', () => {
    const assigned = assignSectionIds(gddStartingStructureContent(), sequentialIdGenerator('sec'));
    const sections = documentSections(assigned);

    expect(sections.map((section) => section.text)).toEqual(SECTION_HEADINGS);
    expect(sections.every((section) => section.level === 1)).toBe(true);
    // Every id is minted and distinct — nothing marks a seeded section apart
    // from any other heading a writer typed themselves.
    expect(new Set(sections.map((section) => section.id)).size).toBe(SECTION_HEADINGS.length);
  });
});
