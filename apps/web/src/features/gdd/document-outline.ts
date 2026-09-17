import { DOCUMENT_SECTION_ID_ATTR } from '@level-zero/domain';
import type { JSONContent } from '@level-zero/ui';

export interface DocumentHeading {
  /**
   * The section this heading addresses, or null until one is minted.
   *
   * Null is not the same as "no section": a body written before section ids
   * existed has none until the editor opens it, and a heading with no id still
   * belongs in the outline — it just cannot carry a status or a thread yet.
   */
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

/**
 * The document's headings, in reading order — the table of contents beside the
 * GDD (spec section 35). Untitled headings are kept so the entry a writer is
 * part-way through typing does not make the list jump around.
 *
 * This reads the raw body rather than `documentSections`, which skips headings
 * without an id: a reader should see an outline of what they are looking at
 * even in the moment before the editor has minted anything.
 */
export function documentOutline(content: JSONContent | null): DocumentHeading[] {
  return (content?.content ?? [])
    .filter((node) => node.type === 'heading')
    .map((node) => ({
      id: sectionIdOf(node),
      level: typeof node.attrs?.level === 'number' ? node.attrs.level : 1,
      text: headingText(node),
    }));
}

function sectionIdOf(heading: JSONContent): string | null {
  const id: unknown = heading.attrs?.[DOCUMENT_SECTION_ID_ATTR];
  return typeof id === 'string' && id.length > 0 ? id : null;
}
