import type { Extensions } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';

import { Callout, CalloutBody, CalloutTitle } from './callout';
import { CardGrid, CardGridCard, CardGridCardBody, CardGridCardTitle } from './card-grid';
import { FindInDocument } from './find-in-document';
import { MarkdownPaste } from './markdown-paste';
import { PullQuote, PullQuoteAttribution, PullQuoteText } from './pull-quote';
import { SectionId } from './section-id';
import { BASE_EDITOR_COMMANDS, createSlashMenuExtension, type EditorCommand } from './slash-menu';
import { StepFlow, StepFlowStep, StepFlowStepBody, StepFlowStepTitle } from './step-flow';
import {
  TabbedBlock,
  TabbedBlockTab,
  TabbedBlockTabBody,
  TabbedBlockTabTitle,
} from './tabbed-block';

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
    // The Design North Star / Design Note callout and the pull-quote (#193).
    // Every surface gets them, same reasoning as `SectionId` below: a callout
    // is as useful in a playtest write-up as in a GDD.
    CalloutTitle,
    CalloutBody,
    Callout,
    PullQuoteText,
    PullQuoteAttribution,
    PullQuote,
    // The step flow (#264): an ordered sequence of titled steps, connected by
    // arrows in the editor and by plain sequence in export. Same reasoning as
    // the callout and pull-quote above — every surface gets it.
    StepFlowStepTitle,
    StepFlowStepBody,
    StepFlowStep,
    StepFlow,
    // The card grid (#263) — a repeatable grid of icon/title/body cards, same
    // reasoning as the callout above: every surface gets it.
    CardGridCardTitle,
    CardGridCardBody,
    CardGridCard,
    CardGrid,
    // The tabbed block (#265) — named tabs, each holding ordinary document
    // content, same reasoning as the callout above: every surface gets it.
    TabbedBlockTabTitle,
    TabbedBlockTabBody,
    TabbedBlockTab,
    TabbedBlock,
    // Markdown is an import/export format, never the stored one: documents are
    // persisted as TipTap JSON (`editor.getJSON()`).
    Markdown,
    MarkdownPaste,
    // Every surface, not just the GDD: a heading typed into a character's
    // background gets an id nothing reads, which is cheaper than giving one
    // surface a different extension set from its neighbours.
    SectionId,
    // Same reasoning: find-in-document (#191) is a capability of the one
    // writing surface, not a second configuration the GDD carries alone. It
    // costs nothing on a surface nobody has searched — the plugin does no
    // work until something dispatches a query.
    FindInDocument,
    ...(slashMenu ? [createSlashMenuExtension([...BASE_EDITOR_COMMANDS, ...commands])] : []),
    ...extensions,
  ];
}
