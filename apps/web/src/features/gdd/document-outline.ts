import { DOCUMENT_SECTION_ID_ATTR } from '@level-zero/domain';
import type { JSONContent } from '@level-zero/ui';

export interface OutlineEntry {
  /**
   * The section this heading addresses, or null until one is minted.
   *
   * Null is not the same as "no section": a body written before section ids
   * existed has none until the editor opens it, and a heading with no id still
   * belongs in the outline — it just cannot carry a status, a thread, or a
   * jump target yet.
   */
  id: string | null;
  level: number;
  text: string;
  /**
   * The number this entry is shown with — "1", "3.2", "A", "B.1" — computed
   * fresh from reading order every render. The Appendices heading itself
   * carries the empty string: it labels the group rather than numbering it.
   */
  number: string;
}

export interface DocumentOutline {
  /** Sections before the appendix group, or every section when there is none. */
  sections: OutlineEntry[];
  /**
   * The run of top-level sections from a level-1 heading reading "Appendices"
   * (or "Appendix") to the end of the document, per
   * docs/decisions/gdd-section-identity.md §6 — null when the document has no
   * such heading.
   */
  appendices: { heading: OutlineEntry; sections: OutlineEntry[] } | null;
}

interface RawHeading {
  id: string | null;
  level: number;
  text: string;
}

function headingText(heading: JSONContent): string {
  return (heading.content ?? [])
    .map((node) => node.text ?? '')
    .join('')
    .trim();
}

function sectionIdOf(heading: JSONContent): string | null {
  const id: unknown = heading.attrs?.[DOCUMENT_SECTION_ID_ATTR];
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function rawHeadings(content: JSONContent | null): RawHeading[] {
  return (content?.content ?? [])
    .filter((node) => node.type === 'heading')
    .map((node) => ({
      id: sectionIdOf(node),
      level: typeof node.attrs?.level === 'number' ? node.attrs.level : 1,
      text: headingText(node),
    }));
}

/** The level-1 heading that opens the Appendices group, case-insensitively. */
function isAppendixLabel(heading: RawHeading): boolean {
  if (heading.level !== 1) return false;
  const trimmed = heading.text.trim().toLowerCase();
  return trimmed === 'appendices' || trimmed === 'appendix';
}

/** 1 → "A", 2 → "B", … 26 → "Z", 27 → "AA" — a spreadsheet column label. */
function columnLetter(n: number): string {
  let value = n;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

/**
 * Numbers a run of headings from reading order, respecting nesting: each
 * heading's number is its parent's number plus its position among the
 * siblings under that parent, where "parent" is the nearest earlier heading
 * of a shallower level — not literally one level shallower, so a level-3
 * heading with no level-2 ancestor still nests one level under its level-1
 * parent instead of producing a gap.
 *
 * `rootLabel` numbers the top level: `String` for the main sequence (1, 2, 3…)
 * or `columnLetter` for the appendices (A, B, C…).
 */
function numberHeadings(headings: RawHeading[], rootLabel: (n: number) => string): OutlineEntry[] {
  const stack: { level: number; childCount: number; number: string }[] = [];
  let topCount = 0;

  return headings.map((heading) => {
    let parent = stack[stack.length - 1];
    while (parent && parent.level >= heading.level) {
      stack.pop();
      parent = stack[stack.length - 1];
    }

    let number: string;
    if (parent) {
      parent.childCount += 1;
      number = `${parent.number}.${parent.childCount}`;
    } else {
      topCount += 1;
      number = rootLabel(topCount);
    }

    stack.push({ level: heading.level, childCount: 0, number });
    return { ...heading, number };
  });
}

/**
 * The table of contents beside the GDD (spec section 35): every heading in
 * reading order, numbered and nested, with the Appendices group broken out
 * and lettered (docs/decisions/gdd-section-identity.md §6). Untitled headings
 * are kept so the entry a writer is part-way through typing does not make the
 * list jump around.
 *
 * This reads the raw body rather than `documentSections`, which skips
 * headings without an id: a reader should see an outline of what they are
 * looking at even in the moment before the editor has minted anything, and
 * numbering is presentation, not identity.
 */
export function documentOutline(content: JSONContent | null): DocumentOutline {
  const headings = rawHeadings(content);
  const appendixIndex = headings.findIndex(isAppendixLabel);

  if (appendixIndex === -1) {
    return { sections: numberHeadings(headings, String), appendices: null };
  }

  const sections = numberHeadings(headings.slice(0, appendixIndex), String);
  // `findIndex` only ever returns an in-bounds index or -1, already handled
  // above, so this heading is always there.
  const appendixHeading = headings[appendixIndex] as RawHeading;
  const appendixRest = headings.slice(appendixIndex + 1);

  return {
    sections,
    appendices: {
      heading: { ...appendixHeading, number: '' },
      sections: numberHeadings(appendixRest, columnLetter),
    },
  };
}
