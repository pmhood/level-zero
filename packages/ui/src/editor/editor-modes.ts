/**
 * The writing surfaces Level Zero offers, and what each one puts on screen.
 *
 * Every surface runs the same editor and the same extensions, so content
 * written or pasted into one is never dropped by another; a mode only decides
 * how much chrome a surface shows and how tall its writing area starts out.
 */
export const EDITOR_MODES = ['document', 'notes', 'compact', 'comment'] as const;

export type EditorMode = (typeof EDITOR_MODES)[number];

/** A row of related toolbar buttons; `editor-toolbar.tsx` holds the contents. */
export type ToolbarGroup = 'marks' | 'headings' | 'lists' | 'blocks' | 'insert' | 'export';

export interface EditorModeConfig {
  /** Toolbar groups, in the order they are rendered. */
  toolbar: ToolbarGroup[];
  /** Whether typing `/` opens the block menu. */
  slashMenu: boolean;
  /** Shown while the document is empty. */
  placeholder: string;
  /** Reading measure and starting height of the writing area. */
  surfaceClassName: string;
}

export const EDITOR_MODE_CONFIG: Record<EditorMode, EditorModeConfig> = {
  document: {
    toolbar: ['headings', 'marks', 'lists', 'blocks', 'insert', 'export'],
    slashMenu: true,
    placeholder: 'Start writing, or press / to insert a block.',
    surfaceClassName: 'min-h-[60vh] text-[15px] leading-7',
  },
  notes: {
    toolbar: ['marks', 'lists', 'blocks', 'export'],
    slashMenu: true,
    placeholder: 'Notes, open questions, things to come back to…',
    surfaceClassName: 'min-h-[240px]',
  },
  compact: {
    toolbar: ['marks', 'lists'],
    slashMenu: false,
    placeholder: 'Add a short description…',
    surfaceClassName: 'min-h-[120px]',
  },
  comment: {
    toolbar: ['marks'],
    slashMenu: false,
    placeholder: 'Leave a comment…',
    surfaceClassName: 'min-h-[72px]',
  },
};
