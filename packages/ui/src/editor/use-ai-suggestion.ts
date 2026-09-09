'use client';

import type { Editor, JSONContent, Range } from '@tiptap/core';
import * as React from 'react';

import { AI_INSTRUCTION_ACTION_ID, type AiEditAction } from './ai-actions';
import {
  aiSuggestionRange,
  applyAiSuggestion,
  rangeReferences,
  rangeText,
  setAiSuggestionRange,
  suggestionContent,
  textRunSelection,
  type AiSuggestionReference,
} from './ai-suggestion';

/** One AI request for a passage of the document. */
export interface AiSuggestionRequest {
  /** Which action asked — an `AiEditAction` id, or `instruction` for `/ai`. */
  action: string;
  /** What the model is being asked to do, verbatim. */
  instruction: string;
  /** The passage, with each entity mention as the token it reads as. Empty for `/ai` at a caret. */
  selection: string;
  /** The mention nodes inside the passage, so the caller can name them as context. */
  references: JSONContent[];
  signal: AbortSignal;
}

export interface AiSuggestionResponse {
  /** The replacement prose. */
  text: string;
  /** The generation record behind it, for provenance. */
  generationId?: string | null;
}

/**
 * An accepted suggestion, once it is in the document.
 *
 * Deliberately not the resulting document. Accepting is an ordinary editor
 * transaction, so the new body has already gone to `onChange` — and therefore
 * to autosave — before this is called. Handing it over again would invite a
 * second writer racing the first, which is how the keystrokes made just after
 * accepting get overwritten.
 */
export interface AcceptedAiEdit {
  action: string;
  /** The action's menu label, for anything that has to name the edit to a user. */
  label: string;
  instruction: string;
  /** The prose that was there before. */
  replaced: string;
  /** The prose that replaced it. */
  accepted: string;
  generationId: string | null;
}

export interface AiEditingOptions {
  /**
   * Runs one AI request. Injected by the feature that owns the document, so
   * this package never learns what a project or a provider is.
   */
  suggest: (request: AiSuggestionRequest) => Promise<AiSuggestionResponse>;
  /**
   * Called once an accepted suggestion is in the document, after `onChange`
   * has already reported the new body.
   */
  onAccept?: (edit: AcceptedAiEdit) => void;
}

/** A suggestion the writer has not answered yet. It lives here, never in the document. */
export interface PendingAiSuggestion {
  action: string;
  label: string;
  instruction: string;
  status: 'loading' | 'ready' | 'error';
  /** The passage as it was when the request went out. */
  replaced: string;
  references: AiSuggestionReference[];
  /** The suggested replacement, once it has arrived. */
  text: string;
  /** The generation record behind the suggestion, for provenance. */
  generationId: string | null;
  error: string | null;
}

export interface AiEditing {
  /** The passage a writer has selected, when an AI action can run on it. */
  selection: Range | null;
  /** Where `/ai` was typed, while its instruction box is open. */
  prompt: Range | null;
  pending: PendingAiSuggestion | null;
  /** Where the pending suggestion belongs now, mapped through every edit since. */
  range: Range | null;
  /** The passage moved on under the suggestion, so accepting it would overwrite newer words. */
  stale: boolean;
  runAction: (action: AiEditAction) => void;
  openPrompt: (editor: Editor, range: Range) => void;
  closePrompt: () => void;
  runInstruction: (instruction: string) => void;
  retry: () => void;
  accept: () => void;
  reject: () => void;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'The AI request failed.';
}

/**
 * Drives inline AI editing for one writing surface.
 *
 * A suggestion is held here and drawn beside the document; the only thing that
 * ever reaches the document is an accepted one, applied as a single
 * transaction. That is what keeps autosave honest: while a writer is deciding,
 * the canonical JSON is exactly what they wrote, and if they reject, nothing
 * happened at all.
 */
export function useAiSuggestion(editor: Editor | null, options: AiEditingOptions): AiEditing {
  const optionsRef = React.useRef(options);
  React.useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const [pending, setPending] = React.useState<PendingAiSuggestion | null>(null);
  const [prompt, setPrompt] = React.useState<Range | null>(null);
  const requestRef = React.useRef<AbortController | null>(null);

  // The document moves under a pending suggestion — the writer keeps typing,
  // the mapped range shifts — so the layer re-reads the editor every time it
  // changes rather than holding a copy that goes out of date.
  const [, onEditorChanged] = React.useReducer((count: number) => count + 1, 0);
  React.useEffect(() => {
    if (!editor) return;

    editor.on('transaction', onEditorChanged);
    return () => {
      editor.off('transaction', onEditorChanged);
    };
  }, [editor]);

  React.useEffect(() => () => requestRef.current?.abort(), []);

  const run = React.useCallback(
    (action: string, label: string, instruction: string, range: Range) => {
      if (!editor) return;

      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;

      const replaced = rangeText(editor, range);
      const references = rangeReferences(editor, range);
      setAiSuggestionRange(editor, range);
      setPending({
        action,
        label,
        instruction,
        status: 'loading',
        replaced,
        references,
        text: '',
        generationId: null,
        error: null,
      });

      optionsRef.current
        .suggest({
          action,
          instruction,
          selection: replaced,
          references: references.map((reference) => reference.node),
          signal: controller.signal,
        })
        .then((response) => {
          if (controller.signal.aborted) return;
          const text = response.text.trim();

          // A provider that answers with nothing is a failed request, not an
          // edit that deletes the passage.
          setPending((current) =>
            current === null
              ? null
              : text
                ? {
                    ...current,
                    status: 'ready',
                    text,
                    generationId: response.generationId ?? null,
                    error: null,
                  }
                : {
                    ...current,
                    status: 'error',
                    error: 'The model returned nothing to suggest.',
                  },
          );
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          setPending((current) =>
            current === null ? null : { ...current, status: 'error', error: errorMessage(cause) },
          );
        });
    },
    [editor],
  );

  const clear = React.useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setPending(null);
    if (editor) setAiSuggestionRange(editor, null);
  }, [editor]);

  const range = editor ? aiSuggestionRange(editor.state) : null;
  const selection =
    editor && editor.isEditable && pending === null && prompt === null
      ? textRunSelection(editor)
      : null;

  // The suggestion was computed against words that are no longer there.
  const stale =
    editor !== null &&
    pending !== null &&
    (range === null || rangeText(editor, range) !== pending.replaced);

  return {
    selection,
    prompt,
    pending,
    range,
    stale,

    runAction: (action) => {
      if (!selection) return;
      run(action.id, action.label, action.instruction, selection);
    },

    openPrompt: (instance, promptRange) => {
      instance.chain().focus().deleteRange(promptRange).run();
      setPrompt({ from: promptRange.from, to: promptRange.from });
    },

    closePrompt: () => setPrompt(null),

    runInstruction: (instruction) => {
      if (!prompt || !instruction.trim()) return;
      setPrompt(null);
      run(AI_INSTRUCTION_ACTION_ID, 'Ask AI', instruction.trim(), prompt);
    },

    retry: () => {
      if (!pending || !range) return;
      run(pending.action, pending.label, pending.instruction, range);
    },

    accept: () => {
      if (!editor || !pending || pending.status !== 'ready' || !range || stale) return;

      const content = suggestionContent(pending.text, pending.references);
      if (content.length === 0) return;

      applyAiSuggestion(editor, range, content);
      requestRef.current = null;
      setPending(null);

      optionsRef.current.onAccept?.({
        action: pending.action,
        label: pending.label,
        instruction: pending.instruction,
        replaced: pending.replaced,
        accepted: pending.text,
        generationId: pending.generationId,
      });
    },

    reject: clear,
  };
}
