import {
  Extension,
  escapeForRegEx,
  getTextBetween,
  getTextSerializersFromSchema,
  isTextSelection,
  type Editor,
  type JSONContent,
  type Range,
} from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** Class the pending suggestion's target run carries while it is being asked about. */
export const AI_SUGGESTION_TARGET_CLASS = 'lz-ai-target';

const aiSuggestionKey = new PluginKey<Range | null>('aiSuggestion');

/**
 * Marks the passage an AI suggestion is about, and applies an accepted one.
 *
 * The suggestion itself is deliberately *not* here. Nothing this extension
 * stores reaches `editor.getJSON()`: the target is a plugin-state range drawn
 * with a decoration, so unaccepted model output can never be autosaved into
 * the canonical document, exported, indexed or versioned. The only thing that
 * ever touches the document is `applyAiSuggestion`, once, when a writer
 * accepts.
 *
 * The range is mapped through every transaction, so a writer can keep typing
 * elsewhere while a suggestion is in flight and it still points at the same
 * words. If those words are deleted the range collapses and the suggestion is
 * dropped rather than landing somewhere it was never about.
 */
export const AiSuggestion = Extension.create({
  name: 'aiSuggestion',

  addProseMirrorPlugins() {
    return [
      new Plugin<Range | null>({
        key: aiSuggestionKey,
        state: {
          init: () => null,
          apply(transaction, current) {
            const next = transaction.getMeta(aiSuggestionKey) as Range | null | undefined;
            if (next !== undefined) return next;
            if (!current) return null;

            // Biased so that text typed against either edge lands outside the
            // passage the suggestion was asked about.
            const from = transaction.mapping.map(current.from, 1);
            const to = transaction.mapping.map(current.to, -1);

            if (current.from === current.to) return { from, to: from };
            // The passage itself was deleted; there is nothing left to replace.
            return to <= from ? null : { from, to };
          },
        },
        props: {
          decorations(state) {
            const range = aiSuggestionKey.getState(state);
            if (!range || range.from === range.to) return null;

            return DecorationSet.create(state.doc, [
              Decoration.inline(range.from, range.to, { class: AI_SUGGESTION_TARGET_CLASS }),
            ]);
          },
        },
      }),
    ];
  },
});

/** The passage a suggestion is currently about, or null when there is none. */
export function aiSuggestionRange(state: EditorState): Range | null {
  return aiSuggestionKey.getState(state) ?? null;
}

/** Points the suggestion at a passage, or clears it with `null`. */
export function setAiSuggestionRange(editor: Editor, range: Range | null): void {
  editor.view.dispatch(editor.state.tr.setMeta(aiSuggestionKey, range));
}

/**
 * The passage an AI action can run on: a text selection inside one block.
 *
 * Deliberately narrow. A suggestion replaces a run of *inline* content, so
 * confining the offer to one text block is what makes that rule true rather
 * than merely intended: a selection can never carry a heading, a table or an
 * entity embed into a replacement built out of plain model output.
 */
export function textRunSelection(editor: Editor): Range | null {
  const { selection } = editor.state;
  if (selection.empty || !isTextSelection(selection)) return null;

  const { $from, $to } = selection;
  if (!$from.sameParent($to) || !$from.parent.isTextblock) return null;

  return { from: selection.from, to: selection.to };
}

/**
 * An inline atom inside the passage — an entity mention — and the token it
 * reads as. Model output is plain text, so the token is how a mention travels
 * out to the model and back again.
 */
export interface AiSuggestionReference {
  token: string;
  node: JSONContent;
}

function textSerializers(editor: Editor) {
  return getTextSerializersFromSchema(editor.schema);
}

/** The passage as the model reads it: prose, with each mention as its own token. */
export function rangeText(editor: Editor, range: Range): string {
  return getTextBetween(editor.state.doc, range, {
    blockSeparator: '\n',
    textSerializers: textSerializers(editor),
  });
}

/** The inline atoms inside a passage, in reading order. */
export function rangeReferences(editor: Editor, range: Range): AiSuggestionReference[] {
  const serializers = textSerializers(editor);
  const references: AiSuggestionReference[] = [];

  editor.state.doc.nodesBetween(range.from, range.to, (node, pos) => {
    if (node.isText || !node.isInline || !node.isAtom) return;

    const token = getTextBetween(
      editor.state.doc,
      { from: pos, to: pos + node.nodeSize },
      { textSerializers: serializers },
    ).trim();
    if (token) references.push({ token, node: node.toJSON() as JSONContent });
  });

  return references;
}

/**
 * Turns suggested plain text back into editor content, restoring the mentions
 * it still names.
 *
 * A suggestion always replaces a run of *inline* content, so it can never
 * restructure the document around it — a model that answers with paragraphs
 * gets hard breaks, not blocks that split the writer's section in half. Every
 * token the model kept becomes the mention node it came from, attributes and
 * all, so a rewritten sentence still points at the same entity; a token it
 * dropped takes the reference with it, which is why the writer sees the
 * suggestion before it is applied.
 */
export function suggestionContent(
  text: string,
  references: AiSuggestionReference[],
): JSONContent[] {
  const byToken = new Map(references.map((reference) => [reference.token, reference.node]));
  // Longest first, so `@Kael Voss` wins over a shorter token inside it.
  const tokens = [...byToken.keys()].sort((a, b) => b.length - a.length);

  const parts = tokens.length
    ? text.split(new RegExp(`(${tokens.map(escapeForRegEx).join('|')})`))
    : [text];

  return parts.flatMap((part) => {
    const node = byToken.get(part);
    if (node) return [structuredClone(node)];

    return part
      .split('\n')
      .flatMap((line, index) => [
        ...(index > 0 ? [{ type: 'hardBreak' }] : []),
        ...(line ? [{ type: 'text', text: line }] : []),
      ]);
  });
}

/**
 * The references the model left out of its suggestion — the ones accepting it
 * would take out of the document. Shown on the card, because losing a link to
 * a character is a decision, not a detail.
 */
export function droppedReferences(
  text: string,
  references: AiSuggestionReference[],
): AiSuggestionReference[] {
  return references.filter((reference) => !text.includes(reference.token));
}

/**
 * Applies an accepted suggestion as one transaction.
 *
 * One transaction, and one that starts its own history group: a single undo
 * takes the document back to exactly what the writer had before they accepted,
 * without swallowing the sentence they typed a moment earlier.
 */
export function applyAiSuggestion(editor: Editor, range: Range, content: JSONContent[]): boolean {
  return editor
    .chain()
    .command(({ tr }) => {
      closeHistory(tr);
      tr.setMeta(aiSuggestionKey, null);
      return true;
    })
    .insertContentAt(range, content)
    .focus()
    .run();
}
