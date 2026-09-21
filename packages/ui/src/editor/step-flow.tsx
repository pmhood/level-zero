// No 'use client' here: this file exports plain data (the node definitions
// and `insertStepFlow`) that `editor-extensions.ts` and `slash-menu.tsx` —
// neither of them client-only — consume at module-eval time. The `*View`
// components below are only ever mounted by TipTap's own
// `ReactNodeViewRenderer`, once already inside `rich-text-editor.tsx`'s
// client boundary, so they need no boundary of their own; giving this file
// one would turn every plain export into a client-reference stub wherever
// `@level-zero/ui`'s barrel is reached from server-rendered code (the same
// failure documented on `callout.tsx`, which this node follows).
import { mergeAttributes, Node, type Editor, type JSONContent, type Range } from '@tiptap/core';
import type { MarkdownRendererHelpers } from '@tiptap/core';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from '@tiptap/react';

import { Button } from '../button';
import { ChevronRightIcon, CloseIcon, PlusIcon } from '../icons';

/** A step's title: real inline content, so it is edited, searched and AI-reachable like any other text. */
export const STEP_FLOW_STEP_TITLE_NODE = 'stepFlowStepTitle';
/** A step's body: ordinary block content — a paragraph naming a mechanic entity, a list, whatever the writer needs. */
export const STEP_FLOW_STEP_BODY_NODE = 'stepFlowStepBody';
/** One step: an optional thumbnail, a title and a body — never a top-level block on its own. */
export const STEP_FLOW_STEP_NODE = 'stepFlowStep';
/** The ordered sequence itself (design system spec §35's Core Loop example). */
export const STEP_FLOW_NODE = 'stepFlow';

/**
 * A step's title. Kept as its own node, rather than folded into the body,
 * for the same reason `CalloutTitle` is: the rendered card always shows one.
 */
export const StepFlowStepTitle = Node.create({
  name: STEP_FLOW_STEP_TITLE_NODE,
  content: 'inline*',

  parseHTML: () => [{ tag: `p[data-type="${STEP_FLOW_STEP_TITLE_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'p',
    mergeAttributes(
      { 'data-type': STEP_FLOW_STEP_TITLE_NODE, class: 'lz-step-flow-step-title' },
      HTMLAttributes,
    ),
    0,
  ],
});

/**
 * A step's body. Plain `block+` content — no attribute holds the text, so a
 * step naming a `mechanic` entity does it with the existing entity mention,
 * exactly as any other document prose does (issue #264's scope decision).
 */
export const StepFlowStepBody = Node.create({
  name: STEP_FLOW_STEP_BODY_NODE,
  content: 'block+',

  parseHTML: () => [{ tag: `div[data-type="${STEP_FLOW_STEP_BODY_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes(
      { 'data-type': STEP_FLOW_STEP_BODY_NODE, class: 'lz-step-flow-step-body' },
      HTMLAttributes,
    ),
    0,
  ],
});

/**
 * One step: an optional thumbnail (the built-in `image` node — no wrapper of
 * its own needed, since `image` is already a plain block-group node), a
 * title and a body. Never valid outside a `StepFlow`, so it carries no
 * `group` of its own.
 */
export const StepFlowStep = Node.create({
  name: STEP_FLOW_STEP_NODE,
  content: `image? ${STEP_FLOW_STEP_TITLE_NODE} ${STEP_FLOW_STEP_BODY_NODE}`,
  defining: true,

  parseHTML: () => [{ tag: `li[data-type="${STEP_FLOW_STEP_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'li',
    mergeAttributes(
      { 'data-type': STEP_FLOW_STEP_NODE, class: 'lz-step-flow-step' },
      HTMLAttributes,
    ),
    0,
  ],

  addNodeView() {
    return ReactNodeViewRenderer(StepFlowStepView);
  },
});

/**
 * The ordered sequence (mockup `docs/mockups/gdd-workspace.png`, "Core
 * Loop": Explore → Salvage → Upgrade → Go Deeper). Rendered as an `<ol>` of
 * `<li>` steps — real sequence, not decoration, so a step naturally reads in
 * order wherever the arrow connectors the live editor draws with CSS do not
 * travel: a Markdown export, a screen reader, an exported HTML page opened
 * with no Level Zero stylesheet. The connectors themselves are never stored;
 * they follow the steps' order, which is the document order.
 */
export const StepFlow = Node.create({
  name: STEP_FLOW_NODE,
  group: 'block',
  content: `${STEP_FLOW_STEP_NODE}+`,
  defining: true,

  parseHTML: () => [{ tag: `ol[data-type="${STEP_FLOW_NODE}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    'ol',
    mergeAttributes({ 'data-type': STEP_FLOW_NODE, class: 'lz-step-flow' }, HTMLAttributes),
    0,
  ],

  renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) =>
    renderStepFlowMarkdown(node, helpers),

  addNodeView() {
    return ReactNodeViewRenderer(StepFlowView);
  },
});

/**
 * Markdown export: a numbered list, one item per step — the "sequence
 * rather than arrow glyphs" issue #264 asks for, since an arrow character
 * reads poorly once it is plain text rather than a positioned connector.
 */
function renderStepFlowMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers): string {
  const steps = (node.content ?? []) as JSONContent[];
  return steps.map((step, index) => renderStepMarkdown(step, index + 1, helpers)).join('\n\n');
}

function renderStepMarkdown(
  step: JSONContent,
  number: number,
  helpers: MarkdownRendererHelpers,
): string {
  const children = (step.content ?? []) as JSONContent[];
  const imageNode = children.find((child) => child.type === 'image');
  const titleNode = children.find((child) => child.type === STEP_FLOW_STEP_TITLE_NODE);
  const bodyNode = children.find((child) => child.type === STEP_FLOW_STEP_BODY_NODE);

  const title = titleNode ? helpers.renderChildren(titleNode.content ?? []).trim() : '';
  const image = imageNode ? helpers.renderChildren([imageNode]).trim() : '';
  const body = bodyNode ? helpers.renderChildren(bodyNode.content ?? [], '\n\n').trim() : '';

  const marker = `${number}. `;
  const indent = ' '.repeat(marker.length);
  const paragraphs = [title && `**${title}**`, image, body].filter((part): part is string =>
    Boolean(part),
  );
  const lines = paragraphs.join('\n\n').split('\n');

  return lines
    .map((line, index) =>
      index === 0 ? `${marker}${line}`.trimEnd() : line ? `${indent}${line}` : '',
    )
    .join('\n');
}

function stepContent(title: string): JSONContent {
  return {
    type: STEP_FLOW_STEP_NODE,
    content: [
      { type: STEP_FLOW_STEP_TITLE_NODE, content: [{ type: 'text', text: title }] },
      { type: STEP_FLOW_STEP_BODY_NODE, content: [{ type: 'paragraph' }] },
    ],
  };
}

function stepFlowContent(): JSONContent {
  return { type: STEP_FLOW_NODE, content: [stepContent('Step 1'), stepContent('Step 2')] };
}

/**
 * Inserts a step flow of two steps, with the caret selecting the first
 * step's default title so typing replaces it right away. `range` is the
 * `/query` a slash command replaces; omitted for a toolbar click, which
 * inserts at the caret instead.
 */
export function insertStepFlow(editor: Editor, range?: Range): void {
  const pos = range ? range.from : editor.state.selection.from;

  let chain = editor.chain().focus();
  if (range) chain = chain.deleteRange(range);
  chain.insertContentAt(pos, stepFlowContent()).run();

  const title = selectFirstNodeFrom(editor, pos, STEP_FLOW_STEP_TITLE_NODE);
  if (title) editor.commands.setTextSelection(title);
  editor.commands.scrollIntoView();
}

/** The `{ from, to }` spanning the first `nodeType` node, searching forward from `pos`. */
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

/** Appends a new step to the flow at `flowPos`, caret in its default title. */
function addStep(editor: Editor, flowPos: number): void {
  const flowNode = editor.state.doc.nodeAt(flowPos);
  if (!flowNode) return;

  const insertPos = flowPos + flowNode.nodeSize - 1;
  const title = `Step ${flowNode.childCount + 1}`;

  editor.chain().focus().insertContentAt(insertPos, stepContent(title)).run();

  const titleRange = selectFirstNodeFrom(editor, insertPos, STEP_FLOW_STEP_TITLE_NODE);
  if (titleRange) editor.commands.setTextSelection(titleRange);
  editor.commands.scrollIntoView();
}

/**
 * Swaps the step at `stepPos` with its neighbour in `direction`. A no-op at
 * either end — the flow's shape stays fixed to "however many steps there
 * are", never authored connectors, so there is nothing to repair afterwards.
 */
function moveStep(editor: Editor, stepPos: number, direction: -1 | 1): void {
  const { state } = editor;
  const $pos = state.doc.resolve(stepPos);
  const flow = $pos.parent;
  if (flow.type.name !== STEP_FLOW_NODE) return;

  const index = $pos.index();
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= flow.childCount) return;

  const starts: number[] = [];
  let offset = $pos.start();
  flow.forEach((child) => {
    starts.push(offset);
    offset += child.nodeSize;
  });

  const [loIndex, hiIndex] = index < targetIndex ? [index, targetIndex] : [targetIndex, index];
  const loStart = starts[loIndex]!;
  const hiStart = starts[hiIndex]!;
  const loNode = flow.child(loIndex);
  const hiNode = flow.child(hiIndex);

  // The higher-positioned slice is replaced first so its position, captured
  // above, is still valid when the lower one is replaced next — nothing
  // before `hiStart` moves as a result of that first replacement.
  const loSlice = state.doc.slice(loStart, loStart + loNode.nodeSize);
  const hiSlice = state.doc.slice(hiStart, hiStart + hiNode.nodeSize);

  const tr = state.tr;
  tr.replaceWith(hiStart, hiStart + hiNode.nodeSize, loSlice.content);
  tr.replaceWith(loStart, loStart + loNode.nodeSize, hiSlice.content);
  editor.view.dispatch(tr);
  editor.commands.focus();
}

/** Removes the step at `stepPos`. A no-op on the last remaining step — a flow is never empty. */
function removeStep(editor: Editor, stepPos: number): void {
  const { state } = editor;
  const $pos = state.doc.resolve(stepPos);
  const flow = $pos.parent;
  if (flow.type.name !== STEP_FLOW_NODE || flow.childCount <= 1) return;

  const node = $pos.nodeAfter;
  if (!node) return;

  editor
    .chain()
    .focus()
    .deleteRange({ from: stepPos, to: stepPos + node.nodeSize })
    .run();
}

function StepFlowView({ editor, getPos }: NodeViewProps) {
  function handleAddStep() {
    const pos = getPos();
    if (pos !== undefined) addStep(editor, pos);
  }

  return (
    <NodeViewWrapper className="lz-step-flow">
      <NodeViewContent className="lz-step-flow-steps" />
      {editor.isEditable && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="lz-step-flow-add"
          onClick={handleAddStep}
        >
          <PlusIcon width={14} height={14} />
          Add step
        </Button>
      )}
    </NodeViewWrapper>
  );
}

interface StepPosition {
  isFirst: boolean;
  isLast: boolean;
  isOnly: boolean;
}

/** Recomputed on every transaction, so sibling adds/removes/reorders keep this step's controls honest. */
function stepPosition(editor: Editor, getPos: () => number | undefined): StepPosition {
  const pos = getPos();
  if (pos === undefined) return { isFirst: true, isLast: true, isOnly: true };

  const $pos = editor.state.doc.resolve(pos);
  const flow = $pos.parent;
  if (flow.type.name !== STEP_FLOW_NODE) return { isFirst: true, isLast: true, isOnly: true };

  const index = $pos.index();
  return {
    isFirst: index === 0,
    isLast: index === flow.childCount - 1,
    isOnly: flow.childCount <= 1,
  };
}

function StepFlowStepView({ editor, getPos }: NodeViewProps) {
  const position = useEditorState({
    editor,
    selector: ({ editor: instance }) => stepPosition(instance, getPos),
  });

  function handleMove(direction: -1 | 1) {
    const pos = getPos();
    if (pos !== undefined) moveStep(editor, pos, direction);
  }

  function handleRemove() {
    const pos = getPos();
    if (pos !== undefined) removeStep(editor, pos);
  }

  return (
    <NodeViewWrapper className="lz-step-flow-step">
      {editor.isEditable && (
        <div className="lz-step-flow-step-controls" contentEditable={false}>
          <button
            type="button"
            aria-label="Move step earlier"
            disabled={position.isFirst}
            onClick={() => handleMove(-1)}
          >
            <ChevronRightIcon width={14} height={14} className="rotate-180" />
          </button>
          <button
            type="button"
            aria-label="Move step later"
            disabled={position.isLast}
            onClick={() => handleMove(1)}
          >
            <ChevronRightIcon width={14} height={14} />
          </button>
          <button
            type="button"
            aria-label="Remove step"
            disabled={position.isOnly}
            onClick={handleRemove}
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>
      )}
      <NodeViewContent className="lz-step-flow-step-content" />
    </NodeViewWrapper>
  );
}
