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
  /**
   * Sends whatever is waiting now, and resolves once it has landed — or
   * rejects with the failure.
   *
   * This is how anything that needs the server to be up to date asks for it:
   * taking a version of the document, say. It goes through here rather than
   * saving alongside, because a second writer to the same document can land
   * out of order and overwrite the edits made since.
   */
  flush: () => Promise<void>;
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

export interface EditorAutosaveOptions {
  /** How long the writer has to pause before a save goes out. */
  delayMs?: number;
}

/**
 * Debounced autosave for a `RichTextEditor`, and the only writer to the
 * document it saves.
 *
 * Saving never touches the editor: the writer keeps typing through a save, and
 * undo/redo stays the editor's own history rather than a trip through the
 * server. A save is one request per pause, not one per keystroke — persistent
 * document versions are a separate, deliberate act.
 *
 * Saves are queued rather than merely debounced, so two writes of the same
 * document are never outstanding at once and the last one to be sent is the
 * last one to land. That is what `flush` leans on: an accepted AI edit and the
 * keystrokes after it are the *same* writer's work, in order, instead of two
 * requests racing to be the version the server keeps.
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
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The save currently outstanding, or null when nothing is in flight. */
  const inFlightRef = React.useRef<Promise<void> | null>(null);

  /** Sends what is waiting, if anything. Never called while another save runs. */
  const saveNow = React.useCallback((): Promise<void> => {
    const content = pendingRef.current;
    if (content === null) return Promise.resolve();

    pendingRef.current = null;
    setStatus('saving');

    return saveRef.current(content).then(
      () => {
        setError(null);
        setStatus(pendingRef.current === null ? 'saved' : 'pending');
      },
      (cause: unknown) => {
        // Keep the edit so the next change resends it rather than losing it.
        pendingRef.current ??= content;
        const failure = asError(cause);
        setError(failure);
        setStatus('error');
        throw failure;
      },
    );
  }, []);

  const flush = React.useCallback((): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const outstanding = inFlightRef.current;
    const save = outstanding === null ? saveNow() : outstanding.then(saveNow, saveNow);

    // Later saves wait for this one; a failure is the caller's to see, not the
    // queue's, so what the queue holds never rejects.
    const queued = save.catch(() => undefined);
    inFlightRef.current = queued;
    void queued.then(() => {
      if (inFlightRef.current === queued) inFlightRef.current = null;
    });

    return save;
  }, [saveNow]);

  const onChange = React.useCallback(
    (content: JSONContent) => {
      pendingRef.current = content;
      setStatus('pending');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush().catch(() => undefined), delayMs);
    },
    [delayMs, flush],
  );

  React.useEffect(
    // Navigating away mid-pause must not silently drop the last edit.
    () => () => void flush().catch(() => undefined),
    [flush],
  );

  return { status, error, onChange, flush };
}
