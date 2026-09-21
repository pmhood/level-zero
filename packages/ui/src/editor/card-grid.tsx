// No 'use client' here: this file exports plain data (the node definitions
// and `insertCardGrid`) that `editor-extensions.ts` and `slash-menu.tsx` —
// neither of them client-only — consume at module-eval time. `CardGridView`
// and `CardView` below are only ever mounted by TipTap's own
// `ReactNodeViewRenderer`, once already inside `rich-text-editor.tsx`'s
// client boundary, so they need no boundary of their own; giving this file
// one would turn every plain export into a client-reference stub wherever
// `@level-zero/ui`'s barrel is reached from server-rendered code (the same
// failure callout.tsx's file-level comment documents: `CALLOUT_VARIANTS.map
// is not a function`). See CLAUDE.md.
import { mergeAttributes, Node, type Editor, type JSONContent, type Range } from '@tiptap/core';
import type { MarkdownRendererHelpers } from '@tiptap/core';
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';

import { DocumentIcon, IdeaLabIcon, MechanicsIcon, StarIcon } from '../icons';

/** A card's title: real inline content, so it is edited, searched and AI-reachable like any other text. */
export const CARD_TITLE_NODE = 'cardTitle';
/** A card's body: ordinary block content — a paragraph, a list, an entity mention, whatever it needs. */
export const CARD_BODY_NODE = 'cardBody';
/** One card. Only ever appears inside a `cardGrid` — it has no `group`, so nothing else can hold one. */
export const CARD_NODE = 'card';
export const CARD_GRID_NODE = 'cardGrid';

/**
 * The fixed set of card icons (issue #263's scope decision: no free-form
 * per-block styling). Purely decorative — assigned when a card is added and
 * kept with the card through reordering, never read by anything outside this
 * file. Four options so a freshly inserted grid's cards read as distinct at a
 * glance, the way the mockup's four Design Pillar cards do
 * (`docs/mockups/gdd-workspace.png`).
 */
export type CardIcon = 'star' | 'idea' | 'mechanics' | 'document';

const CARD_ICON_COMPONENT: Record<CardIcon, typeof StarIcon> = {
  star: StarIcon,
  idea: IdeaLabIcon,
  mechanics: MechanicsIcon,
  document: DocumentIcon,
};

export const CARD_ICONS = Object.keys(CARD_ICON_COMPONENT) as CardIcon[];

function isCardIcon(value: unknown): value is CardIcon {
  return typeof value === 'string' && (CARD_ICONS as string[]).includes(value);
}

/** The icon a newly added card gets, cycling so a grid's cards don't all match. */
function nextCardIcon(existingCardCount: number): CardIcon {
  return CARD_ICONS[existingCardCount % CARD_ICONS.length] ?? 'star';
}

/**
 * A card's title. Kept as its own node, rather than a paragraph inside the
 * body, so a card always shows one distinct line before its sentence — the
 * same reasoning as `CalloutTitle`.
 */
export const CardGridCardTitle = Node.create({
  name: CARD_TITLE_NODE,
  content: 'inline*',

  parseHTML: () => [{ tag: `p[data-type="${CARD_TITLE_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'p',
    mergeAttributes({ 'data-type': CARD_TITLE_NODE, class: 'lz-card-title' }, HTMLAttributes),
    0,
  ],
});

/**
 * A card's body. Plain `block+` content — no attribute holds the text, so a
 * card naming a `design_pillar` entity does it with the existing entity
 * mention, reaching find-in-document, comments, export and the AI layer for
 * free (issue #263's scope decision; the seam is `editor-extensions.ts`'s
 * `extensions` option).
 */
export const CardGridCardBody = Node.create({
  name: CARD_BODY_NODE,
  content: 'block+',

  parseHTML: () => [{ tag: `div[data-type="${CARD_BODY_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes({ 'data-type': CARD_BODY_NODE, class: 'lz-card-body' }, HTMLAttributes),
    0,
  ],
});

/**
 * One card: an icon, a title and a body. Never appears outside a `cardGrid`
 * — it declares no `group`, the same device `CalloutTitle`/`CalloutBody` use
 * to stay out of the base block content.
 */
export const CardGridCard = Node.create({
  name: CARD_NODE,
  content: `${CARD_TITLE_NODE} ${CARD_BODY_NODE}`,
  defining: true,

  addAttributes() {
    return {
      icon: {
        default: 'star',
        parseHTML: (element: HTMLElement): CardIcon => {
          const icon = element.getAttribute('data-icon');
          return isCardIcon(icon) ? icon : 'star';
        },
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-icon': isCardIcon(attributes.icon) ? attributes.icon : 'star',
        }),
      },
    };
  },

  parseHTML: () => [{ tag: `div[data-type="${CARD_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes({ 'data-type': CARD_NODE, class: 'lz-card' }, HTMLAttributes),
    0,
  ],

  addNodeView() {
    return ReactNodeViewRenderer(CardView);
  },
});

/**
 * A repeatable grid of cards — Design Pillars in the mockup
 * (`docs/mockups/gdd-workspace.png`): four cards, each an icon, a title and a
 * sentence. Fixed shape, no layout system: one column count, no per-card
 * styling controls (issue #263's scope decision).
 *
 * `renderHTML` is also this node's HTML export (#190 renders the schema's own
 * output) and `renderMarkdown` is its Markdown export — see the comment on
 * `renderCardGridMarkdown` below.
 */
export const CardGrid = Node.create({
  name: CARD_GRID_NODE,
  group: 'block',
  content: `${CARD_NODE}+`,
  defining: true,

  parseHTML: () => [{ tag: `div[data-type="${CARD_GRID_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes({ 'data-type': CARD_GRID_NODE, class: 'lz-card-grid' }, HTMLAttributes),
    0,
  ],

  renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) =>
    renderCardGridMarkdown(node, helpers),

  addNodeView() {
    return ReactNodeViewRenderer(CardGridView);
  },
});

/**
 * Markdown export: each card as its own heading and paragraph(s) — no
 * schema-specific syntax to learn, and it degrades to plain, readable prose
 * the way a grid of cards should when it leaves a browser.
 */
function renderCardGridMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers): string {
  const cards = (node.content ?? []) as JSONContent[];
  return cards.map((card) => renderCardMarkdown(card, helpers)).join('\n\n');
}

function renderCardMarkdown(card: JSONContent, helpers: MarkdownRendererHelpers): string {
  const [titleNode, bodyNode] = (card.content ?? []) as JSONContent[];
  const title = titleNode ? helpers.renderChildren(titleNode.content ?? []).trim() : '';
  const body = bodyNode ? helpers.renderChildren(bodyNode.content ?? [], '\n\n').trim() : '';
  const heading = title ? `#### ${title}` : '####';
  return body ? `${heading}\n\n${body}` : heading;
}

function cardContent(icon: CardIcon): JSONContent {
  return {
    type: CARD_NODE,
    attrs: { icon },
    content: [
      { type: CARD_TITLE_NODE, content: [{ type: 'text', text: 'New card' }] },
      { type: CARD_BODY_NODE, content: [{ type: 'paragraph' }] },
    ],
  };
}

function cardGridContent(cardCount: number): JSONContent {
  return {
    type: CARD_GRID_NODE,
    content: Array.from({ length: cardCount }, (_, index) => cardContent(nextCardIcon(index))),
  };
}

/**
 * Inserts a card grid of two cards, caret in the first card's title.
 * `range` is the `/query` a slash command replaces; omitted for a toolbar
 * click, which inserts at the caret instead.
 */
export function insertCardGrid(editor: Editor, range?: Range): void {
  const pos = range ? range.from : editor.state.selection.from;

  let chain = editor.chain().focus();
  if (range) chain = chain.deleteRange(range);
  chain.insertContentAt(pos, cardGridContent(2)).run();

  // Same reasoning as `insertCallout`: `pos` sat inside a paragraph's text,
  // not at a block boundary, so ProseMirror may have split that paragraph to
  // fit the grid in. Searching forward from `pos` finds the first card's
  // title wherever it landed, since nothing before `pos` moved.
  const title = selectFirstNodeFrom(editor, pos, CARD_TITLE_NODE);
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

/** A card's index among its grid's children, and the grid's own position, from the card's position. */
function cardGridLocation(
  doc: ProseMirrorNode,
  cardPos: number,
): { gridPos: number; index: number } | null {
  const $pos = doc.resolve(cardPos + 1);
  if ($pos.depth < 1) return null;
  const gridDepth = $pos.depth - 1;
  return { gridPos: $pos.before(gridDepth), index: $pos.index(gridDepth) };
}

/**
 * Rewrites a card's grid to `update`'s result, replacing the whole grid's
 * content in one step — simpler and less error-prone than computing the
 * positions of a shifting set of siblings by hand. `update` returning `null`
 * makes no change (and no transaction — nothing to undo); returning an empty
 * array removes the grid entirely, since `cardGrid`'s content (`card+`) never
 * allows zero cards.
 */
function updateCardGrid(
  editor: Editor,
  cardPos: number,
  update: (cards: ProseMirrorNode[], index: number) => ProseMirrorNode[] | null,
): void {
  editor
    .chain()
    .focus()
    .command(({ tr, dispatch }) => {
      const location = cardGridLocation(tr.doc, cardPos);
      if (!location) return false;
      const gridNode = tr.doc.nodeAt(location.gridPos);
      if (!gridNode) return false;

      const cards: ProseMirrorNode[] = [];
      gridNode.forEach((card) => cards.push(card));
      const next = update(cards, location.index);
      if (next === null) return true;

      if (dispatch) {
        if (next.length === 0) {
          tr.delete(location.gridPos, location.gridPos + gridNode.nodeSize);
        } else {
          const start = location.gridPos + 1;
          tr.replaceWith(start, start + gridNode.content.size, Fragment.fromArray(next));
        }
      }
      return true;
    })
    .run();
}

/** Swaps a card with its neighbour in `direction`; a no-op at either end of the grid. */
export function moveCard(editor: Editor, cardPos: number, direction: -1 | 1): void {
  updateCardGrid(editor, cardPos, (cards, index) => {
    const target = index + direction;
    if (target < 0 || target >= cards.length) return null;
    const current = cards[index];
    const neighbour = cards[target];
    if (!current || !neighbour) return null;
    const next = [...cards];
    next[index] = neighbour;
    next[target] = current;
    return next;
  });
}

/** Removes a card in place. Removing the last card in a grid removes the (now empty) grid too. */
export function removeCard(editor: Editor, cardPos: number): void {
  updateCardGrid(editor, cardPos, (cards, index) => {
    const next = [...cards];
    next.splice(index, 1);
    return next;
  });
}

/** Appends a new card to the grid at `gridPos`, caret in its title. */
export function addCard(editor: Editor, gridPos: number): void {
  const gridNode = editor.state.doc.nodeAt(gridPos);
  if (!gridNode) return;

  const insertPos = gridPos + 1 + gridNode.content.size;
  editor
    .chain()
    .focus()
    .insertContentAt(insertPos, cardContent(nextCardIcon(gridNode.childCount)))
    .run();

  const title = selectFirstNodeFrom(editor, insertPos, CARD_TITLE_NODE);
  if (title) editor.commands.setTextSelection(title);
  editor.commands.scrollIntoView();
}

function CardGridView({ editor, getPos }: NodeViewProps) {
  function handleAddCard() {
    const pos = getPos();
    if (typeof pos === 'number') addCard(editor, pos);
  }

  return (
    <NodeViewWrapper className="lz-card-grid-wrapper">
      <div className="lz-card-grid">
        <NodeViewContent className="lz-card-grid-content" />
      </div>
      {editor.isEditable && (
        <button type="button" className="lz-card-grid-add" onClick={handleAddCard}>
          + Add card
        </button>
      )}
    </NodeViewWrapper>
  );
}

function CardView({ editor, getPos, node }: NodeViewProps) {
  const icon = isCardIcon(node.attrs.icon) ? node.attrs.icon : 'star';
  const Icon = CARD_ICON_COMPONENT[icon];

  function move(direction: -1 | 1) {
    const pos = getPos();
    if (typeof pos === 'number') moveCard(editor, pos, direction);
  }

  function remove() {
    const pos = getPos();
    if (typeof pos === 'number') removeCard(editor, pos);
  }

  return (
    <NodeViewWrapper className="lz-card" data-icon={icon}>
      {editor.isEditable && (
        <div contentEditable={false} className="lz-card-controls">
          <button type="button" aria-label="Move card left" onClick={() => move(-1)}>
            ‹
          </button>
          <button type="button" aria-label="Move card right" onClick={() => move(1)}>
            ›
          </button>
          <button type="button" aria-label="Remove card" onClick={remove}>
            ×
          </button>
        </div>
      )}
      <Icon aria-hidden="true" width={20} height={20} className="lz-card-icon" />
      <NodeViewContent className="lz-card-content" />
    </NodeViewWrapper>
  );
}
