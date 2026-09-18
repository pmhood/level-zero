import { mergeAttributes, Node, type Editor, type JSONContent, type Range } from '@tiptap/core';
import type { MarkdownRendererHelpers } from '@tiptap/core';

/** The quoted passage — `block+`, so it can hold more than one paragraph, like `blockquote`. */
export const PULL_QUOTE_TEXT_NODE = 'pullQuoteText';
/** The attribution line `blockquote` has no place for (issue #193). */
export const PULL_QUOTE_ATTRIBUTION_NODE = 'pullQuoteAttribution';
export const PULL_QUOTE_NODE = 'pullQuote';

/**
 * The quote itself. Renders to a `<blockquote>` like the built-in one, but
 * tagged with `data-type` and given a higher parse priority so pasted HTML
 * from *this* node parses back as a pull-quote rather than as a plain
 * blockquote — StarterKit's `Blockquote` also matches a bare `<blockquote>`.
 */
export const PullQuoteText = Node.create({
  name: PULL_QUOTE_TEXT_NODE,
  content: 'block+',
  priority: 110,

  parseHTML: () => [{ tag: `blockquote[data-type="${PULL_QUOTE_TEXT_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'blockquote',
    mergeAttributes(
      { 'data-type': PULL_QUOTE_TEXT_NODE, class: 'lz-pull-quote-text' },
      HTMLAttributes,
    ),
    0,
  ],
});

/** The "— Author" line: real, editable, searchable text, not an attribute. */
export const PullQuoteAttribution = Node.create({
  name: PULL_QUOTE_ATTRIBUTION_NODE,
  content: 'inline*',

  parseHTML: () => [{ tag: `figcaption[data-type="${PULL_QUOTE_ATTRIBUTION_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'figcaption',
    mergeAttributes(
      { 'data-type': PULL_QUOTE_ATTRIBUTION_NODE, class: 'lz-pull-quote-attribution' },
      HTMLAttributes,
    ),
    0,
  ],
});

/**
 * A quotation with an attribution — what `blockquote` has no place to put
 * (issue #193). Renders as the canonical `<figure><blockquote>…</blockquote>
 * <figcaption>…</figcaption></figure>` pattern, which doubles as this node's
 * HTML export (#190 renders the schema's own output).
 */
export const PullQuote = Node.create({
  name: PULL_QUOTE_NODE,
  group: 'block',
  content: `${PULL_QUOTE_TEXT_NODE} ${PULL_QUOTE_ATTRIBUTION_NODE}`,
  defining: true,

  parseHTML: () => [{ tag: `figure[data-type="${PULL_QUOTE_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'figure',
    mergeAttributes({ 'data-type': PULL_QUOTE_NODE, class: 'lz-pull-quote' }, HTMLAttributes),
    0,
  ],

  // Markdown export: a blockquote with the attribution on its own line after
  // an em dash — the standard, readable way to write a quote's source in
  // plain Markdown, with no schema-specific syntax to learn.
  renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) =>
    renderPullQuoteMarkdown(node, helpers),
});

function renderPullQuoteMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers): string {
  const [textNode, attributionNode] = (node.content ?? []) as JSONContent[];

  const quote = textNode ? helpers.renderChildren(textNode.content ?? [], '\n\n').trim() : '';
  const attribution = attributionNode
    ? helpers.renderChildren(attributionNode.content ?? []).trim()
    : '';

  const lines = quote ? quote.split('\n') : [];
  if (attribution) lines.push('', `— ${attribution}`);

  return lines.map((line) => (line ? `> ${line}` : '>')).join('\n');
}

function pullQuoteContent(): JSONContent {
  return {
    type: PULL_QUOTE_NODE,
    content: [
      { type: PULL_QUOTE_TEXT_NODE, content: [{ type: 'paragraph' }] },
      { type: PULL_QUOTE_ATTRIBUTION_NODE, content: [] },
    ],
  };
}

/**
 * Inserts an empty pull-quote, caret in the quote itself. `range` is the
 * `/query` a slash command replaces; omitted for a toolbar click, which
 * inserts at the caret instead.
 */
export function insertPullQuote(editor: Editor, range?: Range): void {
  const pos = range ? range.from : editor.state.selection.from;

  let chain = editor.chain().focus();
  if (range) chain = chain.deleteRange(range);
  chain.insertContentAt(pos, pullQuoteContent()).run();

  // `pos` sat inside a paragraph's text (the `/query`, or the caret for a
  // toolbar click), not at a block boundary, so ProseMirror may have split
  // that paragraph to fit the pull-quote in. Searching forward from `pos`
  // finds the quote's own empty paragraph wherever it landed, since nothing
  // before `pos` moved.
  const quoteStart = firstNodeStartFrom(editor, pos, 'paragraph');
  if (quoteStart !== null) editor.commands.setTextSelection(quoteStart);
  editor.commands.scrollIntoView();
}

/** The position just inside the first `nodeType` node at or after `pos`, or null. */
function firstNodeStartFrom(editor: Editor, pos: number, nodeType: string): number | null {
  const { doc } = editor.state;
  let start: number | null = null;

  doc.nodesBetween(pos, doc.content.size, (node, nodePos) => {
    if (start !== null) return false;
    if (node.type.name !== nodeType) return true;
    start = nodePos + 1;
    return false;
  });

  return start;
}
