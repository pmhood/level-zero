'use client';

import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useCallback, useEffect } from 'react';

import { findInDocumentState, setFindQuery, stepFindMatch } from './find-in-document';

export interface UseFindInDocumentResult {
  query: string;
  setQuery: (query: string) => void;
  /** How many occurrences of `query` the document currently holds. */
  matchCount: number;
  /** 1-based position of the current match within `matchCount`, or 0 when there is none. */
  activeMatchNumber: number;
  next: () => void;
  previous: () => void;
}

/**
 * Find-in-document (#191) as a controlled field.
 *
 * Reads `FindInDocument`'s own plugin state the way `EditorToolbar` reads
 * active marks — through `useEditorState`, so this only ever shows what the
 * plugin actually matched — and scrolls the current match into view whenever
 * it changes: a fresh search, a step, or the match's position shifting under
 * an edit. `editor.view.domAtPos` is read straight from the ProseMirror view,
 * so the match is reached whether or not it happens to be on screen yet.
 */
export function useFindInDocument(editor: Editor | null): UseFindInDocumentResult {
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => (instance ? findInDocumentState(instance.state) : null),
  });

  const setQuery = useCallback(
    (query: string) => {
      if (editor) setFindQuery(editor, query);
    },
    [editor],
  );

  const next = useCallback(() => {
    if (editor) stepFindMatch(editor, 1);
  }, [editor]);

  const previous = useCallback(() => {
    if (editor) stepFindMatch(editor, -1);
  }, [editor]);

  const activeMatch =
    state && state.activeIndex >= 0 ? state.matches[state.activeIndex] : undefined;
  const activeFrom = activeMatch?.from;

  useEffect(() => {
    if (!editor || activeFrom === undefined) return;

    const found = editor.view.domAtPos(activeFrom);
    const element = found.node instanceof HTMLElement ? found.node : found.node.parentElement;
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [editor, activeFrom]);

  return {
    query: state?.query ?? '',
    setQuery,
    matchCount: state?.matches.length ?? 0,
    activeMatchNumber: state && state.activeIndex >= 0 ? state.activeIndex + 1 : 0,
    next,
    previous,
  };
}
