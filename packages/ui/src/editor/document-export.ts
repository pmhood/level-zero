import { type DocumentContent, documentPlainText } from '@level-zero/domain';
import { generateHTML, getSchema, type Extensions, type JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';

/**
 * Turns a stored document into the two export formats issue #190 asks for.
 *
 * The nodes decide their own serialisation — every extension's own
 * `renderMarkdown` and `renderHTML` fields (`createEditorExtensions`, plus
 * whatever a feature's own nodes like an entity mention add) already carry
 * that logic, because that is what `@tiptap/markdown` and TipTap's own schema
 * already run on. This file is the plumbing that runs them over a document
 * that is not open in a live editor, plus the one thing neither library does
 * on its own: surviving a node type the given `extensions` do not define.
 *
 * That matters because the document being exported was not necessarily
 * written under the schema doing the exporting — a future node type (say,
 * from #193 or #194) can already be stored before this package's extension
 * list is updated to know about it. `sanitizeDocumentForExport` is the seam
 * that keeps that case from crashing the export or losing the content
 * outright, without this file ever naming the node type it doesn't know.
 */

/**
 * Replaces every node whose type is not in `extensions`' schema with a plain
 * paragraph carrying its flattened text, so `generateHTML` (which builds a
 * real ProseMirror node from the JSON and throws on an unknown type) and the
 * Markdown serializer (which silently drops a node with no registered
 * handler) both always have something they can render.
 *
 * A node that is recognised keeps its own shape untouched — this only ever
 * replaces the nodes a schema built from `extensions` cannot place, which is
 * exactly the set a future, not-yet-imported node type falls into.
 */
export function sanitizeDocumentForExport(doc: JSONContent, extensions: Extensions): JSONContent {
  const schema = getSchema(extensions);

  function sanitizeMarks(marks: JSONContent['marks']): JSONContent['marks'] {
    if (!marks || marks.length === 0) return marks;
    const known = marks.filter((mark) => mark.type in schema.marks);
    return known.length === marks.length ? marks : known;
  }

  function sanitize(node: JSONContent): JSONContent | null {
    if (node.type === 'text') {
      const marks = sanitizeMarks(node.marks);
      return marks === node.marks ? node : { ...node, marks };
    }

    if (!node.type || !(node.type in schema.nodes)) {
      const flattened = documentPlainText({ type: 'doc', content: [node] } as DocumentContent);
      return {
        type: 'paragraph',
        content: [{ type: 'text', text: flattened || 'Unsupported content' }],
      };
    }

    if (!Array.isArray(node.content)) return node;

    const content = node.content
      .map((child) => sanitize(child))
      .filter((child): child is JSONContent => child !== null);
    return { ...node, content };
  }

  const sanitized = sanitize(doc);
  if (sanitized?.type === 'doc') return sanitized;
  return { type: 'doc', content: sanitized ? [sanitized] : [] };
}

/** The document's Markdown, with unsupported nodes reduced to their text rather than dropped. */
export function renderDocumentMarkdown(doc: JSONContent, extensions: Extensions): string {
  const sanitized = sanitizeDocumentForExport(doc, extensions);
  const manager = new MarkdownManager({ extensions });
  return manager.serialize(sanitized);
}

const EXPORT_HTML_STYLES = `
  body { font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1a1a1a; max-width: 46rem; margin: 3rem auto; padding: 0 1.5rem; }
  h1, h2, h3 { line-height: 1.25; }
  a { color: #1d6fd6; }
  blockquote { margin: 0; padding-left: 1rem; border-left: 3px solid #d0d0d0; color: #444; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #d0d0d0; padding: 0.4rem 0.6rem; text-align: left; }
  pre { background: #f4f4f4; padding: 0.75rem 1rem; overflow-x: auto; border-radius: 6px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  img { max-width: 100%; }
  ul[data-type="taskList"] { list-style: none; padding-left: 0.25rem; }
  .entity-reference--missing { color: #9a1f1f; text-decoration: line-through; }
  .entity-embed { border: 1px solid #d0d0d0; border-radius: 8px; padding: 0.75rem 1rem; margin: 1rem 0; }
  .entity-embed--missing { border-color: #e3b3b3; color: #9a1f1f; }
`.trim();

/**
 * The document as a standalone HTML file: a full page, not a fragment, so
 * opening it in a browser with no Level Zero session shows a readable page
 * rather than an unstyled body-less snippet.
 */
export function renderStandaloneHtmlDocument(
  doc: JSONContent,
  extensions: Extensions,
  { title }: { title: string },
): string {
  const sanitized = sanitizeDocumentForExport(doc, extensions);
  const body = generateHTML(sanitized, extensions);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${EXPORT_HTML_STYLES}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
