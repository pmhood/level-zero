import type { Editor, Range } from '@tiptap/core';

import type { EditorCommand } from './slash-menu';

/**
 * One AI action a writer can run on the passage they have selected.
 *
 * Every action produces *replacement prose*, which is what makes one card,
 * one diff and one Accept/Reject pair enough for all of them. An action that
 * produced findings rather than an edit would be a different component — the
 * suggestion cards in section 23 of the design system spec — not a different
 * mode of this one.
 *
 * Labels follow the style guide's AI language: contextual, plain, no
 * enthusiastic assistant copy.
 */
export interface AiEditAction {
  id: string;
  label: string;
  /** One short line saying what the writer gets back. */
  hint: string;
  /** What the model is told to do, sent verbatim as the instruction. */
  instruction: string;
}

/** The action id a freeform `/ai` instruction is recorded under. */
export const AI_INSTRUCTION_ACTION_ID = 'instruction';

export const AI_EDIT_ACTIONS: AiEditAction[] = [
  {
    id: 'rewrite',
    label: 'Rewrite',
    hint: 'Same meaning, better written',
    instruction: 'Rewrite the passage so it reads better, keeping its meaning and its claims.',
  },
  {
    id: 'expand',
    label: 'Expand',
    hint: 'Say more about this',
    instruction:
      'Expand the passage with specifics that follow from the project material, without inventing facts that contradict it.',
  },
  {
    id: 'concise',
    label: 'Make it concise',
    hint: 'Shorter, same substance',
    instruction: 'Tighten the passage. Keep every design decision it states and cut the rest.',
  },
  {
    id: 'clarify',
    label: 'Clarify',
    hint: 'Remove ambiguity',
    instruction:
      'Rewrite the passage so a reader cannot misread what is being specified. Make vague statements concrete where the project material settles them.',
  },
  {
    id: 'contradictions',
    label: 'Find contradictions',
    hint: 'Resolve conflicts with the rest of the project',
    instruction:
      'Check the passage against the project material for contradictions and rewrite it so it is consistent with the project. If nothing contradicts, return the passage unchanged.',
  },
  {
    id: 'alternative',
    label: 'Offer an alternative',
    hint: 'A different take on the same point',
    instruction:
      'Offer a different take on the passage: another way to frame the same design point, not a rephrasing of this one.',
  },
];

/**
 * The `/ai` block, added to the `/` menu when the surface has AI editing.
 *
 * The handler is read through a holder rather than captured, because the menu
 * is built once with the editor and the layer that answers it mounts after.
 */
export function aiSlashCommand(open: {
  current: (editor: Editor, range: Range) => void;
}): EditorCommand {
  return {
    id: 'ai',
    title: 'Ask AI',
    hint: 'Draft something here from the project',
    keywords: ['ai', 'draft', 'generate', 'rewrite'],
    run: (editor, range) => open.current(editor, range),
  };
}
