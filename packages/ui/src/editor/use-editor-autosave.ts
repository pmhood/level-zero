'use client';

import type { JSONContent } from '@tiptap/core';
import * as React from 'react';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface EditorAutosave {
  status: SaveStatus;
  /** Set while `status` is `error`; the failed edit is kept and resent on the next change. */
  error: Error | null;
  /** Hand this to `RichTextEditor.onChange`. */
  onChange: (content: JSONContent) => void;
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

export interface EditorAutosaveOptions {
  /** How long the writer has to pause before a save goes out. */
  delayMs?: number;
}

/**
 * Debounced autosave for a `RichTextEditor`.
 *
 * Saving never touches the editor: the writer keeps typing through a save, and
 * undo/redo stays the editor's own history rather than a trip through the
 * server. A save is one request per pause, not one per keystroke — persistent
 * document versions are a separate, deliberate act.
 */
export function useEditorAutosave(
  save: (content: JSONContent) => Promise<unknown>,
  { delayMs = 1200 }: EditorAutosaveOptions = {},
): EditorAutosave {
  const [status, setStatus] = React.useState<SaveStatus>('idle');
  const [error, setError] = React.useState<Error | null>(null);

  const saveRef = React.useRef(save);
  React.useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const pendingRef = React.useRef<JSONContent | null>(null);
  const savingRef = React.useRef(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = React.useCallback(() => {
    timerRef.current = null;

    const content = pendingRef.current;
    if (content === null) return;
    // A save is already in flight; the change that queued this one waits for it.
    if (savingRef.current) {
      timerRef.current = setTimeout(run, delayMs);
      return;
    }

    pendingRef.current = null;
    savingRef.current = true;
    setStatus('saving');

    saveRef
      .current(content)
      .then(() => {
        setError(null);
        setStatus(pendingRef.current === null ? 'saved' : 'pending');
      })
      .catch((cause: unknown) => {
        // Keep the edit so the next change resends it rather than losing it.
        pendingRef.current ??= content;
        setError(asError(cause));
        setStatus('error');
      })
      .finally(() => {
        savingRef.current = false;
      });
  }, [delayMs]);

  const onChange = React.useCallback(
    (content: JSONContent) => {
      pendingRef.current = content;
      setStatus('pending');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(run, delayMs);
    },
    [delayMs, run],
  );

  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      // Navigating away mid-pause must not silently drop the last edit.
      const content = pendingRef.current;
      if (content !== null) void saveRef.current(content).catch(() => undefined);
    },
    [],
  );

  return { status, error, onChange };
}
