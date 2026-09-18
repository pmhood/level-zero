import { type IdGenerator } from '../shared/id';
import { type DocumentContent } from './document';

/**
 * Attribute a heading node carries its section identity in.
 *
 * Minted once and never recomputed, so renaming, moving or demoting a heading
 * leaves every comment and review decision anchored to it exactly where it was
 * (docs/decisions/gdd-section-identity.md §3).
 */
export const DOCUMENT_SECTION_ID_ATTR = 'sectionId';

/** One addressable section: its minted id, its heading level, its heading text. */
export interface DocumentSection {
  id: string;
  level: number;
  text: string;
}

/**
 * The document's sections, in reading order.
 *
 * A section is a *top-level* heading node — a heading inside a table cell or a
 * blockquote is prose, not a section. Top-level headings without an id are
 * skipped: nothing can be anchored to one, so it is not addressable yet.
 */
export function documentSections(content: DocumentContent): DocumentSection[] {
  const sections: DocumentSection[] = [];

  for (const node of topLevelNodes(content)) {
    if (!isHeading(node)) continue;
    const id = sectionIdOf(node);
    if (id === null) continue;
    sections.push({ id, level: headingLevel(node), text: headingText(node) });
  }
  return sections;
}

/**
 * The entities each section's prose points at, keyed by the section's id.
 *
 * A section's *extent* is the top-level nodes after its heading, up to the next
 * heading of any level — so an entity named in 3.2 belongs to 3.2 and not also
 * to 3 (docs/decisions/gdd-section-identity.md §4). A heading's own words are
 * outside its extent, and prose before the first section belongs to no section.
 *
 * Any node carrying a non-empty `entityId` attribute counts, whatever it calls
 * itself: mentions and embeds both store the reference that way, and the domain
 * carries the editor's custom nodes through without learning their names.
 */
export function documentSectionReferences(content: DocumentContent): Map<string, string[]> {
  const sections = new Map<string, Set<string>>();
  let extent: Set<string> | null = null;

  for (const node of topLevelNodes(content)) {
    if (isHeading(node)) {
      const id = sectionIdOf(node);
      if (id === null) {
        extent = null;
        continue;
      }
      extent = sections.get(id) ?? new Set();
      sections.set(id, extent);
      continue;
    }
    if (extent) collectEntityIds(node, extent);
  }

  return new Map([...sections].map(([id, ids]) => [id, [...ids]]));
}

/**
 * Mints ids for headings without one and re-mints duplicates, the first
 * occurrence in reading order keeping the id it had.
 *
 * "First keeps it" is not arbitrary: it is the heading existing anchors were
 * written against, so splitting a section leaves the original with its thread
 * and its status and starts the new one at Draft.
 *
 * The editor mints as the writer types (`packages/ui/src/editor/section-id.ts`);
 * this is the same rule for every other writer — a seeded structure, an import,
 * a script, a test. For editor traffic it is a no-op, and the content is
 * returned unchanged when nothing was minted so autosave writes no new object.
 */
export function assignSectionIds(content: DocumentContent, ids: IdGenerator): DocumentContent {
  const seen = new Set<string>();
  let changed = false;

  const assigned = topLevelNodes(content).map((node) => {
    if (!isHeading(node)) return node;

    const current = sectionIdOf(node);
    if (current !== null && !seen.has(current)) {
      seen.add(current);
      return node;
    }

    const minted = ids.next();
    seen.add(minted);
    changed = true;
    return { ...node, attrs: { ...node.attrs, [DOCUMENT_SECTION_ID_ATTR]: minted } };
  });

  return changed ? { ...content, content: assigned } : content;
}

/** One node of the stored JSON, as much of it as this module reads. */
interface ContentNode {
  type?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown;
}

function topLevelNodes(content: DocumentContent): ContentNode[] {
  const nodes = Array.isArray(content.content) ? content.content : [];
  return nodes.filter(
    (node): node is ContentNode =>
      typeof node === 'object' && node !== null && !Array.isArray(node),
  );
}

function isHeading(node: ContentNode): boolean {
  return node.type === 'heading';
}

function sectionIdOf(node: ContentNode): string | null {
  const id = node.attrs?.[DOCUMENT_SECTION_ID_ATTR];
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function headingLevel(node: ContentNode): number {
  const level = node.attrs?.level;
  return typeof level === 'number' ? level : 1;
}

/** Every non-empty `entityId` attribute under `node`, however deeply it is nested. */
function collectEntityIds(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectEntityIds(child, into);
    return;
  }
  if (typeof node !== 'object' || node === null) return;

  const { attrs, content } = node as { attrs?: Record<string, unknown>; content?: unknown };
  const entityId = attrs?.entityId;
  if (typeof entityId === 'string' && entityId.length > 0) into.add(entityId);
  if (content !== undefined) collectEntityIds(content, into);
}

/** A heading's own words. Its children are text nodes, whatever marks they carry. */
function headingText(node: ContentNode): string {
  const children = Array.isArray(node.content) ? node.content : [];

  return children
    .map((child) => {
      if (typeof child !== 'object' || child === null) return '';
      const { text } = child as { text?: unknown };
      return typeof text === 'string' ? text : '';
    })
    .join('')
    .trim();
}
