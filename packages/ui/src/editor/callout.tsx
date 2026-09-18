// No 'use client' here: this file exports plain data (the node definitions,
// `CALLOUT_VARIANT_CONFIG`, `insertCallout`) that `editor-extensions.ts` and
// `slash-menu.tsx` — neither of them client-only — consume at module-eval
// time. `CalloutView` below is only ever mounted by TipTap's own
// `ReactNodeViewRenderer`, once already inside `rich-text-editor.tsx`'s
// client boundary, so it needs no boundary of its own; giving this file one
// would turn every plain export into a client-reference stub wherever
// `@level-zero/ui`'s barrel is reached from server-rendered code (a real
// build failure this issue's author hit: `CALLOUT_VARIANTS.map is not a
// function`).
import { mergeAttributes, Node, type Editor, type JSONContent, type Range } from '@tiptap/core';
import type { MarkdownRendererHelpers } from '@tiptap/core';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';

import { IdeaLabIcon, StarIcon } from '../icons';

/** The callout's title line: real inline content, so it is edited, searched and AI-reachable like any other text. */
export const CALLOUT_TITLE_NODE = 'calloutTitle';
/** The callout's body: ordinary block content — a paragraph, a list, whatever the writer needs. */
export const CALLOUT_BODY_NODE = 'calloutBody';
export const CALLOUT_NODE = 'callout';

/**
 * The fixed set of callout looks (issue #193's scope decision): free-form
 * colour would need the style guide to say what the colours mean, and it does
 * not. `northStar` is the line the whole design answers to (mockup section 1,
 * "Design North Star"); `note` is the aside explaining why a decision went
 * the way it did (mockup section 4, "Design Note").
 */
export type CalloutVariant = 'northStar' | 'note';

export interface CalloutVariantConfig {
  /** Slash-menu / toolbar label. */
  title: string;
  hint: string;
  /** Seeded into the title on insert; the writer can rename it. */
  defaultTitle: string;
  icon: typeof StarIcon;
}

/** Per-variant metadata the slash menu reads to label its two callout entries. */
export const CALLOUT_VARIANT_CONFIG: Record<CalloutVariant, CalloutVariantConfig> = {
  northStar: {
    title: 'North Star callout',
    hint: 'The line the whole design answers to',
    defaultTitle: 'Design North Star',
    icon: StarIcon,
  },
  note: {
    title: 'Design note callout',
    hint: 'An aside explaining why a decision went the way it did',
    defaultTitle: 'Design Note',
    icon: IdeaLabIcon,
  },
};

export const CALLOUT_VARIANTS = Object.keys(CALLOUT_VARIANT_CONFIG) as CalloutVariant[];

function isCalloutVariant(value: unknown): value is CalloutVariant {
  return typeof value === 'string' && (CALLOUT_VARIANTS as string[]).includes(value);
}

/**
 * A callout's title. Kept as its own node, rather than a paragraph inside the
 * body, so the rendered block always shows one — a callout without a title
 * would just be a tinted blockquote.
 */
export const CalloutTitle = Node.create({
  name: CALLOUT_TITLE_NODE,
  content: 'inline*',

  parseHTML: () => [{ tag: `p[data-type="${CALLOUT_TITLE_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'p',
    mergeAttributes({ 'data-type': CALLOUT_TITLE_NODE, class: 'lz-callout-title' }, HTMLAttributes),
    0,
  ],
});

/**
 * A callout's body. Plain `block+` content — no attribute holds the text, so
 * the inline AI layer, comments and find-in-document reach it exactly like
 * the rest of the document (issue #193's scope decision).
 */
export const CalloutBody = Node.create({
  name: CALLOUT_BODY_NODE,
  content: 'block+',

  parseHTML: () => [{ tag: `div[data-type="${CALLOUT_BODY_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes({ 'data-type': CALLOUT_BODY_NODE, class: 'lz-callout-body' }, HTMLAttributes),
    0,
  ],
});

/**
 * A titled, tinted aside: a Design North Star or a Design Note (mockup,
 * `docs/mockups/gdd-workspace.png`). `DocumentContent` only constrains the
 * outer `doc` node precisely so a node like this survives saving, versioning
 * and restoring without the domain package ever learning it exists.
 *
 * `renderHTML` is also this node's HTML export (#190 renders the schema's own
 * output, not a bespoke switch statement) and `renderMarkdown` is its Markdown
 * export — see the comment on `renderCalloutMarkdown` below.
 */
export const Callout = Node.create({
  name: CALLOUT_NODE,
  group: 'block',
  content: `${CALLOUT_TITLE_NODE} ${CALLOUT_BODY_NODE}`,
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: 'note',
        parseHTML: (element: HTMLElement): CalloutVariant => {
          const variant = element.getAttribute('data-variant');
          return isCalloutVariant(variant) ? variant : 'note';
        },
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-variant': isCalloutVariant(attributes.variant) ? attributes.variant : 'note',
        }),
      },
    };
  },

  parseHTML: () => [{ tag: `aside[data-type="${CALLOUT_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'aside',
    mergeAttributes({ 'data-type': CALLOUT_NODE, class: 'lz-callout' }, HTMLAttributes),
    0,
  ],

  renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) =>
    renderCalloutMarkdown(node, helpers),

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});

/**
 * Markdown export: GitHub/Obsidian's "alert" blockquote syntax
 * (`> [!TAG] Title`), so a reader — or another Markdown renderer entirely —
 * understands it without knowing this schema. `note` reuses GitHub's own
 * `NOTE` tag; `northStar` gets one of its own since GitHub has none for it.
 */
function renderCalloutMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers): string {
  const variant = isCalloutVariant(node.attrs?.variant) ? node.attrs.variant : 'note';
  const tag = variant === 'northStar' ? 'NORTH-STAR' : 'NOTE';
  const [titleNode, bodyNode] = (node.content ?? []) as JSONContent[];

  const title = titleNode ? helpers.renderChildren(titleNode.content ?? []).trim() : '';
  const body = bodyNode ? helpers.renderChildren(bodyNode.content ?? [], '\n\n').trim() : '';

  const heading = `[!${tag}]${title ? ` ${title}` : ''}`;
  const lines = body ? [heading, ...body.split('\n')] : [heading];
  return lines.map((line) => (line ? `> ${line}` : '>')).join('\n');
}

function CalloutView({ node }: NodeViewProps) {
  const variant = isCalloutVariant(node.attrs.variant) ? node.attrs.variant : 'note';
  const Icon = CALLOUT_VARIANT_CONFIG[variant].icon;

  return (
    <NodeViewWrapper data-variant={variant} className="lz-callout">
      <Icon aria-hidden="true" width={18} height={18} className="lz-callout-icon" />
      <NodeViewContent className="lz-callout-content" />
    </NodeViewWrapper>
  );
}

function calloutContent(variant: CalloutVariant): JSONContent {
  return {
    type: CALLOUT_NODE,
    attrs: { variant },
    content: [
      {
        type: CALLOUT_TITLE_NODE,
        content: [{ type: 'text', text: CALLOUT_VARIANT_CONFIG[variant].defaultTitle }],
      },
      { type: CALLOUT_BODY_NODE, content: [{ type: 'paragraph' }] },
    ],
  };
}

/**
 * Inserts a callout of `variant`, with the caret selecting the default title
 * so typing replaces it right away. `range` is the `/query` a slash command
 * replaces; omitted for a toolbar click, which inserts at the caret instead.
 */
export function insertCallout(editor: Editor, variant: CalloutVariant, range?: Range): void {
  const pos = range ? range.from : editor.state.selection.from;

  let chain = editor.chain().focus();
  if (range) chain = chain.deleteRange(range);
  chain.insertContentAt(pos, calloutContent(variant)).run();

  // `pos` sat inside a paragraph's text (the `/query`, or the caret for a
  // toolbar click), not at a block boundary, so ProseMirror may have split
  // that paragraph to fit the callout in — the title's actual position isn't
  // `pos` plus a fixed offset. Searching forward from `pos` finds it wherever
  // it landed, since nothing before `pos` moved.
  const title = selectFirstNodeFrom(editor, pos, CALLOUT_TITLE_NODE);
  if (title) editor.commands.setTextSelection(title);
  editor.commands.scrollIntoView();
}

/** The `{ from, to }` spanning `nodeType`'s inline content, searching forward from `pos`. */
function selectFirstNodeFrom(
  editor: Editor,
  pos: number,
  nodeType: string,
): { from: number; to: number } | null {
  const { doc } = editor.state;
  let range: { from: number; to: number } | null = null;

  doc.nodesBetween(pos, doc.content.size, (node, nodePos) => {
    if (range) return false;
    if (node.type.name !== nodeType) return true;
    range = { from: nodePos + 1, to: nodePos + 1 + node.content.size };
    return false;
  });

  return range;
}
