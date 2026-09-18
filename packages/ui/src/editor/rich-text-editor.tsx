'use client';

import type { Editor, Extensions, JSONContent, Range } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import * as React from 'react';

import { cn } from '../cn';
import { aiSlashCommand } from './ai-actions';
import { AiEditingLayer } from './ai-editing-layer';
import { AiSuggestion } from './ai-suggestion';
import { createEditorExtensions } from './editor-extensions';
import { EDITOR_MODE_CONFIG, type EditorMode } from './editor-modes';
import { EditorToolbar } from './editor-toolbar';
import { activeSectionId } from './section-id';
import type { EditorCommand } from './slash-menu';
import type { AiEditingOptions } from './use-ai-suggestion';

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
  /**
   * Called with the section the caret sits in whenever it moves — the id a
   * top-level heading carries (`section-id.ts`), or null before the first
   * heading. What lets a feature address the section somebody is writing in
   * without reaching into the editor itself.
   */
  onSectionChange?: (sectionId: string | null) => void;
  /**
   * Called with the live TipTap editor once it is created, and with `null`
   * when it is torn down — the seam a feature uses to command the editor
   * imperatively (inserting a section, say) without this package growing a
   * bespoke prop for every such command.
   */
  onEditorReady?: (editor: Editor | null) => void;
  /** Which chrome this surface shows; see `EDITOR_MODE_CONFIG`. */
  mode?: EditorMode;
  /** Overrides the mode's default placeholder. */
  placeholder?: string;
  editable?: boolean;
  /** Custom nodes and marks — see `createEditorExtensions`. */
  extensions?: Extensions;
  /** Extra entries for the `/` menu. */
  commands?: EditorCommand[];
  /**
   * Turns on inline AI editing: the selection menu, the `/ai` block and the
   * suggestion card. The feature that owns the document supplies the request,
   * so this package never learns what a project or a provider is.
   */
  ai?: AiEditingOptions;
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
  onSectionChange,
  onEditorReady,
  mode = 'document',
  placeholder,
  editable = true,
  extensions,
  commands,
  ai,
  toolbarActions,
  label,
  className,
}: RichTextEditorProps) {
  const config = EDITOR_MODE_CONFIG[mode];

  // Panels are positioned inside this box, and the `/ai` block reaches the
  // layer through the holder because the `/` menu is built with the editor,
  // before the layer that answers it has mounted.
  const surfaceRef = React.useRef<HTMLDivElement>(null);
  const openAiPromptRef = React.useRef<(instance: Editor, range: Range) => void>(() => undefined);

  // Held in a ref so a new callback identity on re-render never rebuilds the
  // editor — that would discard the undo history mid-sentence.
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const onSectionChangeRef = React.useRef(onSectionChange);
  React.useEffect(() => {
    onSectionChangeRef.current = onSectionChange;
  }, [onSectionChange]);

  // Built once per surface: TipTap reads both only when it creates the editor,
  // and rebuilding them on every render would churn the view for nothing.
  const [initialOptions] = React.useState(() => ({
    content: content ?? undefined,
    extensions: createEditorExtensions({
      placeholder: placeholder ?? config.placeholder,
      slashMenu: config.slashMenu,
      commands: ai ? [...(commands ?? []), aiSlashCommand(openAiPromptRef)] : commands,
      extensions: ai ? [AiSuggestion, ...(extensions ?? [])] : extensions,
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
    onCreate: ({ editor: instance }) => {
      onSectionChangeRef.current?.(activeSectionId(instance));
    },
    onSelectionUpdate: ({ editor: instance }) => {
      onSectionChangeRef.current?.(activeSectionId(instance));
    },
    onUpdate: ({ editor: instance, transaction }) => {
      // Mounting the view and moving the caret both produce updates. Reporting
      // those would autosave a document nobody has touched.
      if (!transaction.docChanged) return;
      onChangeRef.current?.(instance.getJSON());
      // An edit can mint the caret's section id, so the section is re-read
      // here as well as on a selection change.
      onSectionChangeRef.current?.(activeSectionId(instance));
    },
  });

  React.useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  const onEditorReadyRef = React.useRef(onEditorReady);
  React.useEffect(() => {
    onEditorReadyRef.current = onEditorReady;
  }, [onEditorReady]);

  React.useEffect(() => {
    onEditorReadyRef.current?.(editor);
    return () => onEditorReadyRef.current?.(null);
  }, [editor]);

  return (
    <div ref={surfaceRef} className={cn('relative flex min-w-0 flex-col gap-3', className)}>
      {/* A surface nobody can type on has nothing to format: a read-only
          preview — a version being compared, an embed — shows the writing
          alone. */}
      {editable && (
        <EditorToolbar editor={editor} groups={config.toolbar} actions={toolbarActions} />
      )}
      <EditorContent editor={editor} />
      {ai && (
        <AiEditingLayer
          editor={editor}
          options={ai}
          containerRef={surfaceRef}
          openPromptRef={openAiPromptRef}
        />
      )}
    </div>
  );
}
