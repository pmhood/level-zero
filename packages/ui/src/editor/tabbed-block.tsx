// No 'use client' here: this file exports plain data (the node definitions
// and `insertTabbedBlock`) that `editor-extensions.ts` and `slash-menu.tsx` —
// neither of them client-only — consume at module-eval time. The `*View`
// components below are only ever mounted by TipTap's own
// `ReactNodeViewRenderer`, once already inside `rich-text-editor.tsx`'s
// client boundary, so they need no boundary of their own; giving this file
// one would turn every plain export into a client-reference stub wherever
// `@level-zero/ui`'s barrel is reached from server-rendered code (the same
// failure documented on `callout.tsx`, which this node follows). See
// CLAUDE.md.
import { mergeAttributes, Node, type Editor, type JSONContent, type Range } from '@tiptap/core';
import type { MarkdownRendererHelpers } from '@tiptap/core';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from '@tiptap/react';

import { ChevronRightIcon, CloseIcon, PlusIcon } from '../icons';
import { Tabs, type TabItem } from '../tabs';

/** A tab's name: real inline content, so it is edited, searched and AI-reachable like any other text. */
export const TABBED_BLOCK_TAB_TITLE_NODE = 'tabbedBlockTabTitle';
/** A tab's content: ordinary block content — prose, an image, a table, a note, whatever it needs. */
export const TABBED_BLOCK_TAB_BODY_NODE = 'tabbedBlockTabBody';
/** One tab: a name and a body. Only ever appears inside a `tabbedBlock` — it has no `group` of its own. */
export const TABBED_BLOCK_TAB_NODE = 'tabbedBlockTab';
/** Named tabs over document content (design system spec §18/§29/§49; mockup's "Gameplay & Controls"). */
export const TABBED_BLOCK_NODE = 'tabbedBlock';

/** Clamps a persisted or stale `activeIndex` into the range a block with `count` tabs actually has. */
function clampActiveIndex(value: unknown, count: number): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
  if (count <= 0) return 0;
  return Math.min(Math.max(parsed, 0), count - 1);
}

/**
 * A tab's name. Kept as its own node, rather than folded into the body, for
 * the same reason `CardGridCardTitle` is: it is what the tab strip's button
 * mirrors, so the rendered tab always has one to show.
 */
export const TabbedBlockTabTitle = Node.create({
  name: TABBED_BLOCK_TAB_TITLE_NODE,
  content: 'inline*',

  parseHTML: () => [{ tag: `p[data-type="${TABBED_BLOCK_TAB_TITLE_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'p',
    mergeAttributes(
      { 'data-type': TABBED_BLOCK_TAB_TITLE_NODE, class: 'lz-tabbed-block-tab-title' },
      HTMLAttributes,
    ),
    0,
  ],
});

/**
 * A tab's content. Plain `block+` content — no attribute holds it, so a tab
 * naming an entity (a keybinding table's row, say) does it with the existing
 * entity mention, exactly as any other document prose does (issue #265's
 * scope decision: everything inside is document content).
 */
export const TabbedBlockTabBody = Node.create({
  name: TABBED_BLOCK_TAB_BODY_NODE,
  content: 'block+',

  parseHTML: () => [{ tag: `div[data-type="${TABBED_BLOCK_TAB_BODY_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes(
      { 'data-type': TABBED_BLOCK_TAB_BODY_NODE, class: 'lz-tabbed-block-tab-body' },
      HTMLAttributes,
    ),
    0,
  ],
});

/**
 * One tab: a name and a body. Never valid outside a `tabbedBlock`, so it
 * carries no `group` of its own — the same device `CardGridCard` uses.
 */
export const TabbedBlockTab = Node.create({
  name: TABBED_BLOCK_TAB_NODE,
  content: `${TABBED_BLOCK_TAB_TITLE_NODE} ${TABBED_BLOCK_TAB_BODY_NODE}`,
  defining: true,

  parseHTML: () => [{ tag: `div[data-type="${TABBED_BLOCK_TAB_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes(
      { 'data-type': TABBED_BLOCK_TAB_NODE, class: 'lz-tabbed-block-tab' },
      HTMLAttributes,
    ),
    0,
  ],

  addNodeView() {
    return ReactNodeViewRenderer(TabbedBlockTabView);
  },
});

/**
 * Named tabs, each holding its own document content — Movement / Interaction
 * / Combat (Minimal) / Submarine / Camera in the mockup's "Gameplay &
 * Controls" (`docs/mockups/gdd-workspace.png`). Fixed shape, no layout
 * system: one strip, one visible panel (issue #265's scope decision).
 *
 * `activeIndex` is presentation state, not authored content — which tab is
 * showing — kept as an attribute the same way `CardGridCard`'s `icon` is.
 * Only the tab at `activeIndex` is visible in the live editor (`hidden`, set
 * by `TabbedBlockTabView`); a static export has no "active" state, so
 * `renderHTML`/`renderMarkdown` show every tab's content in sequence — the
 * "flattens to sequential sections" issue #265 asks for.
 */
export const TabbedBlock = Node.create({
  name: TABBED_BLOCK_NODE,
  group: 'block',
  content: `${TABBED_BLOCK_TAB_NODE}+`,
  defining: true,

  addAttributes() {
    return {
      activeIndex: {
        default: 0,
        parseHTML: (element: HTMLElement): number => {
          const raw = Number.parseInt(element.getAttribute('data-active-index') ?? '0', 10);
          return Number.isFinite(raw) && raw >= 0 ? raw : 0;
        },
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-active-index': String(
            typeof attributes.activeIndex === 'number' && attributes.activeIndex >= 0
              ? Math.trunc(attributes.activeIndex)
              : 0,
          ),
        }),
      },
    };
  },

  parseHTML: () => [{ tag: `div[data-type="${TABBED_BLOCK_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes({ 'data-type': TABBED_BLOCK_NODE, class: 'lz-tabbed-block' }, HTMLAttributes),
    0,
  ],

  renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) =>
    renderTabbedBlockMarkdown(node, helpers),

  addNodeView() {
    return ReactNodeViewRenderer(TabbedBlockView);
  },
});

/**
 * Markdown export: each tab as its own heading and body — a reader of the
 * Markdown gets every tab's content, headed by the tab's name, rather than
 * only whichever tab happened to be showing (issue #265's export rule).
 */
function renderTabbedBlockMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers): string {
  const tabs = (node.content ?? []) as JSONContent[];
  return tabs.map((tab) => renderTabMarkdown(tab, helpers)).join('\n\n');
}

function renderTabMarkdown(tab: JSONContent, helpers: MarkdownRendererHelpers): string {
  const [titleNode, bodyNode] = (tab.content ?? []) as JSONContent[];
  const title = titleNode ? helpers.renderChildren(titleNode.content ?? []).trim() : '';
  const body = bodyNode ? helpers.renderChildren(bodyNode.content ?? [], '\n\n').trim() : '';
  const heading = title ? `### ${title}` : '###';
  return body ? `${heading}\n\n${body}` : heading;
}

function tabContent(title: string): JSONContent {
  return {
    type: TABBED_BLOCK_TAB_NODE,
    content: [
      { type: TABBED_BLOCK_TAB_TITLE_NODE, content: [{ type: 'text', text: title }] },
      { type: TABBED_BLOCK_TAB_BODY_NODE, content: [{ type: 'paragraph' }] },
    ],
  };
}

function tabbedBlockContent(): JSONContent {
  return {
    type: TABBED_BLOCK_NODE,
    attrs: { activeIndex: 0 },
    content: [tabContent('Tab 1'), tabContent('Tab 2')],
  };
}

/**
 * Inserts a tabbed block of two tabs, with the caret selecting the first
 * tab's default name so typing replaces it right away. `range` is the
 * `/query` a slash command replaces; omitted for a toolbar click, which
 * inserts at the caret instead.
 */
export function insertTabbedBlock(editor: Editor, range?: Range): void {
  const pos = range ? range.from : editor.state.selection.from;

  let chain = editor.chain().focus();
  if (range) chain = chain.deleteRange(range);
  chain.insertContentAt(pos, tabbedBlockContent()).run();

  const title = selectFirstNodeFrom(editor, pos, TABBED_BLOCK_TAB_TITLE_NODE);
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

/** Switches which tab is showing. A UI navigation, not a content edit, so it never enters undo history. */
export function setActiveTab(editor: Editor, blockPos: number, index: number): void {
  editor
    .chain()
    .command(({ tr, dispatch }) => {
      const node = tr.doc.nodeAt(blockPos);
      if (!node || node.type.name !== TABBED_BLOCK_NODE) return false;

      if (dispatch) {
        tr.setNodeAttribute(blockPos, 'activeIndex', clampActiveIndex(index, node.childCount));
        tr.setMeta('addToHistory', false);
      }
      return true;
    })
    .run();
}

/** Appends a new tab to the block at `blockPos`, makes it active, caret in its default name. */
export function addTab(editor: Editor, blockPos: number): void {
  const blockNode = editor.state.doc.nodeAt(blockPos);
  if (!blockNode) return;

  const insertPos = blockPos + blockNode.nodeSize - 1;
  const newIndex = blockNode.childCount;

  editor
    .chain()
    .focus()
    .insertContentAt(insertPos, tabContent(`Tab ${newIndex + 1}`))
    .command(({ tr, dispatch }) => {
      if (dispatch) tr.setNodeAttribute(blockPos, 'activeIndex', newIndex);
      return true;
    })
    .run();

  const title = selectFirstNodeFrom(editor, insertPos, TABBED_BLOCK_TAB_TITLE_NODE);
  if (title) editor.commands.setTextSelection(title);
  editor.commands.scrollIntoView();
}

/**
 * Swaps the tab at `tabPos` with its neighbour in `direction`. A no-op at
 * either end. `activeIndex` follows the moved tab, so switching a tab you are
 * looking at to a new position keeps it showing.
 */
export function moveTab(editor: Editor, tabPos: number, direction: -1 | 1): void {
  const { state } = editor;
  const $pos = state.doc.resolve(tabPos);
  const block = $pos.parent;
  if (block.type.name !== TABBED_BLOCK_NODE) return;

  const index = $pos.index();
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= block.childCount) return;

  const starts: number[] = [];
  let offset = $pos.start();
  block.forEach((child) => {
    starts.push(offset);
    offset += child.nodeSize;
  });

  const [loIndex, hiIndex] = index < targetIndex ? [index, targetIndex] : [targetIndex, index];
  const loStart = starts[loIndex]!;
  const hiStart = starts[hiIndex]!;
  const loNode = block.child(loIndex);
  const hiNode = block.child(hiIndex);

  // The higher-positioned slice is replaced first so its position, captured
  // above, is still valid when the lower one is replaced next — nothing
  // before `hiStart` moves as a result of that first replacement.
  const loSlice = state.doc.slice(loStart, loStart + loNode.nodeSize);
  const hiSlice = state.doc.slice(hiStart, hiStart + hiNode.nodeSize);

  const blockPos = $pos.before();
  const currentActive = clampActiveIndex(block.attrs.activeIndex, block.childCount);
  const nextActive =
    currentActive === index ? targetIndex : currentActive === targetIndex ? index : currentActive;

  const tr = state.tr;
  tr.replaceWith(hiStart, hiStart + hiNode.nodeSize, loSlice.content);
  tr.replaceWith(loStart, loStart + loNode.nodeSize, hiSlice.content);
  if (nextActive !== currentActive) tr.setNodeAttribute(blockPos, 'activeIndex', nextActive);
  editor.view.dispatch(tr);
  editor.commands.focus();
}

/**
 * Removes the tab at `tabPos`. A no-op on the last remaining tab — a tabbed
 * block is never empty, the same rule `removeStep` applies to a step flow.
 */
export function removeTab(editor: Editor, tabPos: number): void {
  const { state } = editor;
  const $pos = state.doc.resolve(tabPos);
  const block = $pos.parent;
  if (block.type.name !== TABBED_BLOCK_NODE || block.childCount <= 1) return;

  const node = $pos.nodeAfter;
  if (!node) return;

  const index = $pos.index();
  const blockPos = $pos.before();
  const currentActive = clampActiveIndex(block.attrs.activeIndex, block.childCount);
  const nextActive = clampActiveIndex(
    currentActive > index ? currentActive - 1 : currentActive,
    block.childCount - 1,
  );

  editor
    .chain()
    .focus()
    .deleteRange({ from: tabPos, to: tabPos + node.nodeSize })
    .command(({ tr, dispatch }) => {
      if (dispatch) tr.setNodeAttribute(blockPos, 'activeIndex', nextActive);
      return true;
    })
    .run();
}

/** The tab strip's labels and which one is active, recomputed on every transaction. */
function tabbedBlockSnapshot(
  editor: Editor,
  getPosition: () => number | undefined,
): { titles: string[]; activeIndex: number } {
  const pos = getPosition();
  const node = pos === undefined ? null : editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== TABBED_BLOCK_NODE) return { titles: [], activeIndex: 0 };

  const titles: string[] = [];
  node.forEach((tab) => titles.push(tab.firstChild?.textContent ?? ''));
  return { titles, activeIndex: clampActiveIndex(node.attrs.activeIndex, node.childCount) };
}

/**
 * The position of the block's currently active tab, computed by walking its
 * children — the same "sum sibling sizes" approach `moveTab` uses, just
 * stopping at `activeIndex` instead of a swap target. `null` if `blockPos`
 * no longer names a tabbed block (a stale position from a since-rewritten
 * document).
 */
function activeTabPosition(editor: Editor, blockPos: number): number | null {
  const node = editor.state.doc.nodeAt(blockPos);
  if (!node || node.type.name !== TABBED_BLOCK_NODE) return null;

  const activeIdx = clampActiveIndex(node.attrs.activeIndex, node.childCount);
  let pos = blockPos + 1;
  for (let index = 0; index < activeIdx; index += 1) {
    pos += node.child(index).nodeSize;
  }
  return pos;
}

function TabbedBlockView({ editor, getPos }: NodeViewProps) {
  const { titles, activeIndex } = useEditorState({
    editor,
    selector: ({ editor: instance }) => tabbedBlockSnapshot(instance, getPos),
  });

  function handleChangeTab(value: string) {
    const pos = getPos();
    if (pos !== undefined) setActiveTab(editor, pos, Number(value));
  }

  function handleAddTab() {
    const pos = getPos();
    if (pos !== undefined) addTab(editor, pos);
  }

  function handleMoveActive(direction: -1 | 1) {
    const pos = getPos();
    if (pos === undefined) return;
    const tabPos = activeTabPosition(editor, pos);
    if (tabPos !== null) moveTab(editor, tabPos, direction);
  }

  function handleRemoveActive() {
    const pos = getPos();
    if (pos === undefined) return;
    const tabPos = activeTabPosition(editor, pos);
    if (tabPos !== null) removeTab(editor, tabPos);
  }

  const items: TabItem[] = titles.map((title, index) => ({
    value: String(index),
    label: title.trim() || `Tab ${index + 1}`,
  }));

  return (
    <NodeViewWrapper className="lz-tabbed-block">
      <div className="lz-tabbed-block-tabs" contentEditable={false}>
        <Tabs items={items} value={String(activeIndex)} onChange={handleChangeTab} />
        {editor.isEditable && (
          <div className="lz-tabbed-block-tab-controls">
            <button
              type="button"
              aria-label="Move tab earlier"
              disabled={activeIndex === 0}
              onClick={() => handleMoveActive(-1)}
            >
              <ChevronRightIcon width={14} height={14} className="rotate-180" />
            </button>
            <button
              type="button"
              aria-label="Move tab later"
              disabled={activeIndex === titles.length - 1}
              onClick={() => handleMoveActive(1)}
            >
              <ChevronRightIcon width={14} height={14} />
            </button>
            <button
              type="button"
              aria-label="Remove tab"
              disabled={titles.length <= 1}
              onClick={handleRemoveActive}
            >
              <CloseIcon width={14} height={14} />
            </button>
            <button type="button" aria-label="Add tab" onClick={handleAddTab}>
              <PlusIcon width={14} height={14} />
            </button>
          </div>
        )}
      </div>
      <NodeViewContent className="lz-tabbed-block-panels" />
    </NodeViewWrapper>
  );
}

/** Whether the tab at `getPosition()` is the one currently showing, recomputed on every transaction. */
function isActiveTab(editor: Editor, getPosition: () => number | undefined): boolean {
  const pos = getPosition();
  if (pos === undefined) return true;

  const $pos = editor.state.doc.resolve(pos);
  const block = $pos.parent;
  if (block.type.name !== TABBED_BLOCK_NODE) return true;

  const activeIndex = clampActiveIndex(block.attrs.activeIndex, block.childCount);
  return $pos.index() === activeIndex;
}

/**
 * A tab's panel: content only. Its move/remove controls live in the always-
 * visible tab strip (`TabbedBlockView`) rather than here, because only the
 * active panel is ever visible (`hidden` below) — controls on an inactive,
 * hidden panel would be impossible to reach without first switching to it.
 */
function TabbedBlockTabView({ editor, getPos }: NodeViewProps) {
  const isActive = useEditorState({
    editor,
    selector: ({ editor: instance }) => isActiveTab(instance, getPos),
  });

  return (
    <NodeViewWrapper
      className="lz-tabbed-block-panel"
      role="tabpanel"
      data-active={isActive}
      hidden={!isActive}
    >
      <NodeViewContent className="lz-tabbed-block-panel-content" />
    </NodeViewWrapper>
  );
}
