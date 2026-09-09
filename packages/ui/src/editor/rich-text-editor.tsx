'use client';

import type { Extensions, JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import * as React from 'react';

import { cn } from '../cn';
import { createEditorExtensions } from './editor-extensions';
import { EDITOR_MODE_CONFIG, type EditorMode } from './editor-modes';
import { EditorToolbar } from './editor-toolbar';
import type { EditorCommand } from './slash-menu';

export interface RichTextEditorProps {
  /**
   * The document, as TipTap JSON — the canonical stored form everywhere in
   * Level Zero. Read when the editor is created and *not* afterwards, so a
   * save round-trip can never reset the caret or wipe the undo history; give
   * the element a `key` to load a different document into the same surface.
   */
  content: JSONContent | null;
  /** Called on every edit with the new canonical JSON. */
  onChange?: (content: JSONContent) => void;
  /** Which chrome this surface shows; see `EDITOR_MODE_CONFIG`. */
  mode?: EditorMode;
  /** Overrides the mode's default placeholder. */
  placeholder?: string;
  editable?: boolean;
  /** Custom nodes and marks — see `createEditorExtensions`. */
  extensions?: Extensions;
  /** Extra entries for the `/` menu. */
  commands?: EditorCommand[];
  /** Rendered at the right end of the toolbar — save state, document actions, … */
  toolbarActions?: React.ReactNode;
  /** Names the writing area for screen readers, e.g. "Game design document". */
  label: string;
  className?: string;
}

/**
 * Every rich-text surface in Level Zero: game design documents, notes, lore,
 * character backgrounds, idea descriptions and playtest write-ups.
 *
 * There is deliberately one of these. A feature picks a `mode` and passes any
 * custom nodes it needs; it never assembles its own TipTap editor, because
 * two configurations means content that survives in one place and is silently
 * dropped in another.
 */
export function RichTextEditor({
  content,
  onChange,
  mode = 'document',
  placeholder,
  editable = true,
  extensions,
  commands,
  toolbarActions,
  label,
  className,
}: RichTextEditorProps) {
  const config = EDITOR_MODE_CONFIG[mode];

  // Held in a ref so a new callback identity on re-render never rebuilds the
  // editor — that would discard the undo history mid-sentence.
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Built once per surface: TipTap reads both only when it creates the editor,
  // and rebuilding them on every render would churn the view for nothing.
  const [initialOptions] = React.useState(() => ({
    content: content ?? undefined,
    extensions: createEditorExtensions({
      placeholder: placeholder ?? config.placeholder,
      slashMenu: config.slashMenu,
      commands,
      extensions,
    }),
  }));

  const editorProps = React.useMemo(
    () => ({
      attributes: {
        class: cn('tiptap-surface focus:outline-none', config.surfaceClassName),
        'aria-label': label,
      },
    }),
    [config.surfaceClassName, label],
  );

  const editor = useEditor({
    // Next renders this on the server first; TipTap needs a DOM.
    immediatelyRender: false,
    editable,
    ...initialOptions,
    editorProps,
    onUpdate: ({ editor: instance, transaction }) => {
      // Mounting the view and moving the caret both produce updates. Reporting
      // those would autosave a document nobody has touched.
      if (!transaction.docChanged) return;
      onChangeRef.current?.(instance.getJSON());
    },
  });

  React.useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <EditorToolbar editor={editor} groups={config.toolbar} actions={toolbarActions} />
      <EditorContent editor={editor} />
    </div>
  );
}
