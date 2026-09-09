import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import * as React from 'react';

import { Button, type ButtonProps } from '../button';
import { cn } from '../cn';
import type { ToolbarGroup } from './editor-modes';

/**
 * The design system's small ghost button (spec section 14/16), plus the one
 * thing a formatting control needs that a button does not: a pressed state for
 * the mark or block under the caret.
 *
 * `active` is left undefined by the controls that insert something rather than
 * toggle it, which drops `aria-pressed` — a divider is a button, not a switch
 * that happens to be off.
 */
function ToolbarButton({ active, className, ...props }: ButtonProps & { active?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={active}
      className={cn('px-2 text-xs', active && 'bg-active text-foreground', className)}
      {...props}
    />
  );
}

function ToolbarSeparator() {
  return <span aria-hidden className="mx-0.5 h-4 w-px bg-border-subtle" />;
}

/** Prompts for a URL, seeded with whatever is already there. */
function askForUrl(message: string, current = ''): string | null {
  const url = window.prompt(message, current);
  return url === null ? null : url.trim();
}

export interface EditorToolbarProps {
  editor: Editor | null;
  groups: ToolbarGroup[];
  /** Rendered at the right end — save state, document actions, … */
  actions?: React.ReactNode;
}

/**
 * One toolbar, composed from the groups the editor's mode asks for
 * (`EDITOR_MODE_CONFIG`). Surfaces differ by which groups they list, never by
 * shipping a second toolbar.
 */
export function EditorToolbar({ editor, groups, actions }: EditorToolbarProps) {
  const active = useEditorState({
    editor,
    selector: ({ editor: instance }) =>
      instance
        ? {
            bold: instance.isActive('bold'),
            italic: instance.isActive('italic'),
            strike: instance.isActive('strike'),
            heading1: instance.isActive('heading', { level: 1 }),
            heading2: instance.isActive('heading', { level: 2 }),
            heading3: instance.isActive('heading', { level: 3 }),
            bulletList: instance.isActive('bulletList'),
            orderedList: instance.isActive('orderedList'),
            taskList: instance.isActive('taskList'),
            blockquote: instance.isActive('blockquote'),
            codeBlock: instance.isActive('codeBlock'),
            link: instance.isActive('link'),
          }
        : null,
  });

  const [copied, setCopied] = React.useState(false);

  async function copyAsMarkdown() {
    if (!editor) return;
    await navigator.clipboard.writeText(editor.getMarkdown());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function toggleLink() {
    if (!editor) return;
    const url = askForUrl('Link to', editor.getAttributes('link').href ?? '');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  function insertImage() {
    if (!editor) return;
    const src = askForUrl('Image URL');
    if (!src) return;
    editor.chain().focus().setImage({ src }).run();
  }

  const groupContent: Record<ToolbarGroup, React.ReactNode> = {
    marks: (
      <>
        <ToolbarButton
          active={active?.bold}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          aria-label="Bold"
          className="font-bold"
        >
          B
        </ToolbarButton>
        <ToolbarButton
          active={active?.italic}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          aria-label="Italic"
          className="italic"
        >
          I
        </ToolbarButton>
        <ToolbarButton
          active={active?.strike}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          aria-label="Strikethrough"
          className="line-through"
        >
          S
        </ToolbarButton>
      </>
    ),
    headings: (
      <>
        <ToolbarButton
          active={active?.heading1}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          active={active?.heading2}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          active={active?.heading3}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolbarButton>
      </>
    ),
    lists: (
      <>
        <ToolbarButton
          active={active?.bulletList}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          List
        </ToolbarButton>
        <ToolbarButton
          active={active?.orderedList}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          Numbered
        </ToolbarButton>
        <ToolbarButton
          active={active?.taskList}
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
        >
          Tasks
        </ToolbarButton>
      </>
    ),
    blocks: (
      <>
        <ToolbarButton
          active={active?.blockquote}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          Quote
        </ToolbarButton>
        <ToolbarButton
          active={active?.codeBlock}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        >
          Code
        </ToolbarButton>
        <ToolbarButton onClick={() => editor?.chain().focus().setHorizontalRule().run()}>
          Divider
        </ToolbarButton>
      </>
    ),
    insert: (
      <>
        <ToolbarButton active={active?.link} onClick={toggleLink}>
          Link
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          Table
        </ToolbarButton>
        <ToolbarButton onClick={insertImage}>Image</ToolbarButton>
      </>
    ),
    export: (
      <ToolbarButton onClick={copyAsMarkdown}>{copied ? 'Copied' : 'Copy Markdown'}</ToolbarButton>
    ),
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border-subtle pb-2">
      {groups.map((group, index) => (
        <React.Fragment key={group}>
          {index > 0 && <ToolbarSeparator />}
          {groupContent[group]}
        </React.Fragment>
      ))}
      {actions && <div className="ml-auto flex items-center gap-2 pl-2">{actions}</div>}
    </div>
  );
}
