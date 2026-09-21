import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion';
import * as React from 'react';

import { cn } from '../cn';
import { CALLOUT_VARIANT_CONFIG, CALLOUT_VARIANTS, insertCallout } from './callout';
import { insertCardGrid } from './card-grid';
import { insertPullQuote } from './pull-quote';

export interface EditorCommand {
  id: string;
  title: string;
  /** One short line explaining what the block is for. */
  hint?: string;
  /** Extra words the menu should match on, beyond the title. */
  keywords?: string[];
  /** `range` covers the typed `/query`, so a command replaces it as it inserts. */
  run: (editor: Editor, range: Range) => void;
}

/** The blocks every surface can insert. Callers append their own to this list. */
export const BASE_EDITOR_COMMANDS: EditorCommand[] = [
  {
    id: 'heading-1',
    title: 'Heading 1',
    hint: 'Top-level section',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    id: 'heading-2',
    title: 'Heading 2',
    hint: 'Section',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    id: 'heading-3',
    title: 'Heading 3',
    hint: 'Sub-section',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    id: 'bullet-list',
    title: 'Bulleted list',
    keywords: ['ul', 'unordered'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: 'ordered-list',
    title: 'Numbered list',
    keywords: ['ol', 'ordered'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: 'task-list',
    title: 'Task list',
    hint: 'Checkboxes you can tick off',
    keywords: ['todo', 'checkbox'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: 'blockquote',
    title: 'Quote',
    keywords: ['blockquote'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  // One command per callout variant, so the menu names each precisely
  // (CALLOUT_VARIANT_CONFIG lives with the node in `callout.tsx`; this file
  // stays the one place all base commands, including these, are assembled).
  ...CALLOUT_VARIANTS.map((variant): EditorCommand => {
    const config = CALLOUT_VARIANT_CONFIG[variant];
    return {
      id: `callout-${variant}`,
      title: config.title,
      hint: config.hint,
      keywords: ['callout', 'aside', variant === 'northStar' ? 'vision' : 'note'],
      run: (editor, range) => insertCallout(editor, variant, range),
    };
  }),
  {
    id: 'pull-quote',
    title: 'Pull-quote',
    hint: 'A quotation with an attribution',
    keywords: ['quote', 'blockquote', 'attribution', 'pullquote'],
    run: (editor, range) => insertPullQuote(editor, range),
  },
  {
    id: 'card-grid',
    title: 'Card grid',
    hint: 'A repeatable grid of icon, title and body cards',
    keywords: ['cards', 'grid', 'pillars'],
    run: (editor, range) => insertCardGrid(editor, range),
  },
  {
    id: 'code-block',
    title: 'Code block',
    keywords: ['snippet', 'pre'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: 'table',
    title: 'Table',
    hint: '3 × 3 with a header row',
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    id: 'horizontal-rule',
    title: 'Divider',
    keywords: ['hr', 'rule', 'separator'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
];

/** Case-insensitive match against the title and any extra keywords. */
export function matchEditorCommands(commands: EditorCommand[], query: string): EditorCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return commands;

  return commands.filter((command) =>
    [command.title, ...(command.keywords ?? [])].some((term) =>
      term.toLowerCase().includes(needle),
    ),
  );
}

interface SlashMenuHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const SlashMenu = React.forwardRef<SlashMenuHandle, SuggestionProps<EditorCommand, EditorCommand>>(
  function SlashMenu({ items, command }, ref) {
    const [selected, setSelected] = React.useState(0);

    React.useEffect(() => setSelected(0), [items]);

    React.useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (items.length === 0) return false;

          if (event.key === 'ArrowDown') {
            setSelected((index) => (index + 1) % items.length);
            return true;
          }
          if (event.key === 'ArrowUp') {
            setSelected((index) => (index - 1 + items.length) % items.length);
            return true;
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            const item = items[selected];
            if (item) command(item);
            return true;
          }
          return false;
        },
      }),
      [items, selected, command],
    );

    if (items.length === 0) return null;

    return (
      <div
        role="listbox"
        aria-label="Insert block"
        className="max-h-72 w-60 overflow-y-auto rounded-lg border border-border bg-raised p-1 shadow-[var(--lz-shadow-floating)]"
      >
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={index === selected}
            onMouseEnter={() => setSelected(index)}
            onClick={() => command(item)}
            className={cn(
              'flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left',
              index === selected ? 'bg-hover text-foreground' : 'text-muted-foreground',
            )}
          >
            <span className="text-sm font-medium">{item.title}</span>
            {item.hint && <span className="text-xs text-faint-foreground">{item.hint}</span>}
          </button>
        ))}
      </div>
    );
  },
);

/** Typing `/` opens a menu of the blocks in `commands`. */
export function createSlashMenuExtension(commands: EditorCommand[]): Extension {
  return Extension.create({
    name: 'slashMenu',

    addProseMirrorPlugins() {
      return [
        Suggestion<EditorCommand, EditorCommand>({
          editor: this.editor,
          char: '/',
          pluginKey: new PluginKey('slashMenu'),
          allow: ({ editor }) => !editor.isActive('codeBlock'),
          items: ({ query }) => matchEditorCommands(commands, query),
          command: ({ editor, range, props }) => props.run(editor, range),
          render: () => {
            let renderer: ReactRenderer<SlashMenuHandle> | null = null;
            let unmount: (() => void) | undefined;

            return {
              onStart: (props) => {
                renderer = new ReactRenderer(SlashMenu, { props, editor: props.editor });
                unmount = props.mount(renderer.element as HTMLElement);
              },
              onUpdate: (props) => renderer?.updateProps(props),
              onKeyDown: (props) => renderer?.ref?.onKeyDown(props) ?? false,
              onExit: () => {
                unmount?.();
                unmount = undefined;
                renderer?.destroy();
                renderer = null;
              },
            };
          },
        }),
      ];
    },
  });
}
