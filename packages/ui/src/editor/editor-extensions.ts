import type { Extensions } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';

import { MarkdownPaste } from './markdown-paste';
import { BASE_EDITOR_COMMANDS, createSlashMenuExtension, type EditorCommand } from './slash-menu';

export interface EditorExtensionOptions {
  placeholder: string;
  /** Whether typing `/` opens the block menu. */
  slashMenu: boolean;
  /**
   * Extra blocks for the `/` menu, on top of the built-in ones.
   *
   * Custom nodes register their own entry here so the menu stays one list.
   */
  commands?: EditorCommand[];
  /**
   * Custom nodes and marks. This is the seam entity mentions, entity embeds,
   * asset embeds and AI suggestion diffs plug into: they are ordinary TipTap
   * nodes passed in by the feature that owns them, so this package never has
   * to know what an entity is.
   */
  extensions?: Extensions;
}

/**
 * The one extension set every Level Zero writing surface runs.
 *
 * Feature code calls this (or, more usually, just renders `RichTextEditor`)
 * rather than assembling its own TipTap configuration — otherwise two
 * surfaces drift apart and content saved by one loses structure in the other.
 */
export function createEditorExtensions({
  placeholder,
  slashMenu,
  commands = [],
  extensions = [],
}: EditorExtensionOptions): Extensions {
  return [
    // Paragraphs, headings, marks, lists, blockquote, code, links, horizontal
    // rules and undo/redo. Undo history is the editor's own: it must survive
    // autosave, so nothing here ever reloads content behind the writer.
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      },
    }),
    Placeholder.configure({ placeholder }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: true } }),
    Image,
    // Markdown is an import/export format, never the stored one: documents are
    // persisted as TipTap JSON (`editor.getJSON()`).
    Markdown,
    MarkdownPaste,
    ...(slashMenu ? [createSlashMenuExtension([...BASE_EDITOR_COMMANDS, ...commands])] : []),
    ...extensions,
  ];
}
