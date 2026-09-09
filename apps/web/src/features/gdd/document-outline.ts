import type { JSONContent } from '@level-zero/ui';

export interface DocumentHeading {
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
 */
export function documentOutline(content: JSONContent | null): DocumentHeading[] {
  return (content?.content ?? [])
    .filter((node) => node.type === 'heading')
    .map((node) => ({
      level: typeof node.attrs?.level === 'number' ? node.attrs.level : 1,
      text: headingText(node),
    }));
}
