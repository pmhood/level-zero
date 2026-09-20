import type { Entity } from '@level-zero/domain';
import {
  createEditorExtensions,
  renderDocumentMarkdown,
  renderStandaloneHtmlDocument,
  type Extensions,
  type JSONContent,
} from '@level-zero/ui';

import { resolveEntityReferencesForExport } from '@/features/entities/entity-reference';

export type DocumentExportFormat = 'markdown' | 'html';

/**
 * The schema an export renders against: the same base nodes every writing
 * surface uses. Entity mentions and embeds are not in it — `entities` and
 * `projectId` resolve them into plain, already-linked text and blockquotes
 * before rendering (`resolveEntityReferencesForExport`), so by the time this
 * schema sees the document there is no custom node type left needing one.
 * Any node type that still isn't in this list — a stale one, or one from a
 * feature not yet wired in here — is handled by `sanitizeDocumentForExport`
 * inside the render functions below, not by this list growing a case for it.
 */
function gddExportExtensions(): Extensions {
  return createEditorExtensions({ placeholder: '', slashMenu: false });
}

export function renderGddDocumentMarkdown({
  content,
  projectId,
  entities,
}: {
  content: JSONContent;
  projectId: string;
  entities: readonly Entity[];
}): string {
  const resolved = resolveEntityReferencesForExport(content, entities, projectId);
  return renderDocumentMarkdown(resolved, gddExportExtensions());
}

export function renderGddDocumentHtml({
  content,
  projectId,
  entities,
  title,
}: {
  content: JSONContent;
  projectId: string;
  entities: readonly Entity[];
  title: string;
}): string {
  const resolved = resolveEntityReferencesForExport(content, entities, projectId);
  return renderStandaloneHtmlDocument(resolved, gddExportExtensions(), { title });
}

/**
 * The file a document exports as, named for the document rather than for its
 * id — `documentId.md` tells a reader nothing when they've been handed the
 * file outside the app.
 */
export function documentExportFilename(name: string, extension: 'md' | 'html'): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${slug || 'document'}.${extension}`;
}

/** Saves a text file through the browser's own download mechanism — no server round trip. */
function downloadTextFile(filename: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

/**
 * Exports the active document exactly as it stands (issue #190): the stored
 * TipTap JSON is read, never written, so exporting has no effect on the
 * document itself.
 */
export function exportGddDocument({
  format,
  content,
  projectId,
  entities,
  documentName,
}: {
  format: DocumentExportFormat;
  content: JSONContent;
  projectId: string;
  entities: readonly Entity[];
  documentName: string;
}): void {
  if (format === 'markdown') {
    const markdown = renderGddDocumentMarkdown({ content, projectId, entities });
    downloadTextFile(
      documentExportFilename(documentName, 'md'),
      markdown,
      'text/markdown;charset=utf-8',
    );
    return;
  }

  const html = renderGddDocumentHtml({ content, projectId, entities, title: documentName });
  downloadTextFile(documentExportFilename(documentName, 'html'), html, 'text/html;charset=utf-8');
}
