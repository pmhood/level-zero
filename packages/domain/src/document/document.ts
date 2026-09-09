import { type Entity } from '../entity/entity';
import { ValidationError } from '../shared/errors';
import { requireJsonObject } from '../shared/validation';
import { type EntityVersion, type VersionReason } from '../version/entity-version';

/**
 * A rich-text body, in the structured form the editor reads and writes.
 *
 * This is TipTap's JSON document shape described structurally, because the
 * domain must not depend on an editor library. Only the outer `doc` node is
 * constrained: everything inside it — paragraphs, headings, tables, entity
 * mentions, asset embeds — is carried through untouched, so a custom node a
 * feature adds survives saving, versioning and restoring without this package
 * ever learning what it is.
 *
 * Rendered HTML and Markdown are export formats, never the stored one.
 */
export interface DocumentContent {
  type: 'doc';
  [key: string]: unknown;
}

/** Field of a `document` entity's `data` the body lives in. */
export const DOCUMENT_CONTENT_KEY = 'content';

/** Key of the label a snapshot was taken under, within an `EntityVersion`'s metadata. */
export const DOCUMENT_VERSION_NAME_KEY = 'name';

export const MAX_DOCUMENT_VERSION_NAME_LENGTH = 200;

/**
 * Why a document snapshot exists.
 *
 * Autosave writes the working copy and nothing else; these are the deliberate
 * acts that earn a permanent entry in a history list. `restore` is missing on
 * purpose — restoring records its own version — and so are `branch` and
 * `promotion`, which are entity operations rather than document snapshots.
 */
export const DOCUMENT_VERSION_REASONS = [
  'manual',
  'milestone',
  'ai_edit',
  'playtest',
  'import',
] as const satisfies readonly VersionReason[];

export type DocumentVersionReason = (typeof DOCUMENT_VERSION_REASONS)[number];

export function emptyDocumentContent(): DocumentContent {
  return { type: 'doc', content: [] };
}

/** Validates a body on the way in: it must be a JSON `doc` node. */
export function requireDocumentContent(field: string, value: unknown): DocumentContent {
  const object = requireJsonObject(field, value);

  if (object.type !== 'doc') {
    throw new ValidationError(`${field} must be a structured document node`, {
      field,
      received: object.type,
    });
  }
  return object as DocumentContent;
}

/**
 * Reads the body out of an entity's type-specific `data`.
 *
 * Anything that is not a document node reads as an empty document rather than
 * reaching an editor and failing there.
 */
export function documentContent(source: Pick<Entity, 'data'>): DocumentContent {
  const stored = source.data[DOCUMENT_CONTENT_KEY];
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return emptyDocumentContent();
  }

  const content = stored as DocumentContent;
  return content.type === 'doc' ? content : emptyDocumentContent();
}

/**
 * The body's prose, with its structure dropped.
 *
 * Every `text` node is collected in reading order, whatever node holds it, so a
 * heading, a table cell and a custom node all contribute the words they show.
 * Used for search indexing and for anything else that needs the document as
 * plain text; rendering is still the editor's job.
 */
export function documentPlainText(content: DocumentContent): string {
  const parts: string[] = [];

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (typeof node !== 'object' || node === null) return;

    const { text, content: children } = node as { text?: unknown; content?: unknown };
    if (typeof text === 'string' && text.length > 0) parts.push(text);
    if (children !== undefined) walk(children);
  };

  walk(content.content);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** The `data` for a document entity carrying `content`, keeping any other fields. */
export function documentData(
  content: DocumentContent,
  existing: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...existing, [DOCUMENT_CONTENT_KEY]: content };
}

/** The label a snapshot was taken under, or null when it was unnamed. */
export function documentVersionName(version: Pick<EntityVersion, 'metadata'>): string | null {
  const name = version.metadata[DOCUMENT_VERSION_NAME_KEY];
  return typeof name === 'string' ? name : null;
}
