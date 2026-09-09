'use client';

import { posToDOMRect, type Editor, type Range } from '@tiptap/core';
import * as React from 'react';

import { Button } from '../button';
import { cn } from '../cn';
import { SparklesIcon } from '../icons';
import { Input } from '../input';
import { AI_EDIT_ACTIONS } from './ai-actions';
import { droppedReferences } from './ai-suggestion';
import {
  useAiSuggestion,
  type AiEditing,
  type AiEditingOptions,
  type PendingAiSuggestion,
} from './use-ai-suggestion';

/**
 * Places a floating panel under the passage it is about.
 *
 * Coordinates come from the view rather than from a selection rectangle the
 * browser owns, so a panel stays put while the writer keeps typing above it.
 */
function anchorStyle(
  editor: Editor,
  range: Range,
  container: HTMLElement | null,
): React.CSSProperties {
  if (!container) return { top: 0, left: 0 };

  try {
    const target = posToDOMRect(editor.view, range.from, range.to);
    const bounds = container.getBoundingClientRect();
    return {
      top: target.bottom - bounds.top + 8,
      left: Math.max(0, Math.min(target.left - bounds.left, bounds.width - 360)),
    };
  } catch {
    // A position the view cannot resolve yet (first paint, or a test DOM with
    // no layout). Corner-anchored beats not rendering the panel at all.
    return { top: 0, left: 0 };
  }
}

function FloatingPanel({
  style,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      style={style}
      className={cn(
        'absolute z-30 rounded-lg border border-border bg-raised shadow-[var(--lz-shadow-floating)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** The AI header every panel shares: the one place purple is the right colour. */
function AiPanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-medium text-ai-foreground">
      <SparklesIcon aria-hidden className="size-3.5" />
      {children}
    </p>
  );
}

/** The AI actions offered for the passage the writer has selected. */
function AiSelectionMenu({ ai, style }: { ai: AiEditing; style: React.CSSProperties }) {
  return (
    <FloatingPanel style={style} className="w-56 p-1" role="menu" aria-label="AI actions">
      <div className="px-2 py-1">
        <AiPanelHeading>Ask AI about this</AiPanelHeading>
      </div>
      {AI_EDIT_ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          role="menuitem"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => ai.runAction(action)}
          className="flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left text-muted-foreground hover:bg-hover hover:text-foreground"
        >
          <span className="text-sm font-medium">{action.label}</span>
          <span className="text-xs text-faint-foreground">{action.hint}</span>
        </button>
      ))}
    </FloatingPanel>
  );
}

/** The freeform instruction box `/ai` opens at the caret. */
function AiPromptBox({ ai, style }: { ai: AiEditing; style: React.CSSProperties }) {
  const [instruction, setInstruction] = React.useState('');

  return (
    <FloatingPanel style={style} className="w-[360px] p-3">
      <AiPanelHeading>Ask AI</AiPanelHeading>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          ai.runInstruction(instruction);
        }}
      >
        <Input
          autoFocus
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && ai.closePrompt()}
          placeholder="Draft the core loop from the pillars…"
          aria-label="What should the AI write here?"
        />
        <Button type="submit" variant="ai" size="sm" disabled={!instruction.trim()}>
          Generate
        </Button>
      </form>
    </FloatingPanel>
  );
}

function SuggestionBody({ pending }: { pending: PendingAiSuggestion }) {
  if (pending.status === 'loading') {
    return <p className="mt-2 text-sm text-muted-foreground">Reading the project…</p>;
  }

  if (pending.status === 'error') {
    return <p className="mt-2 text-sm text-error">{pending.error}</p>;
  }

  const dropped = droppedReferences(pending.text, pending.references);

  return (
    <>
      {pending.replaced && (
        <div className="mt-2">
          <p className="text-xs font-medium text-faint-foreground">Current</p>
          <p className="mt-0.5 max-h-24 overflow-y-auto text-sm text-muted-foreground line-through decoration-1">
            {pending.replaced}
          </p>
        </div>
      )}
      <div className="mt-2">
        <p className="text-xs font-medium text-faint-foreground">Suggested</p>
        <p className="mt-0.5 max-h-48 overflow-y-auto text-sm whitespace-pre-wrap text-foreground">
          {pending.text}
        </p>
      </div>
      {dropped.length > 0 && (
        <p className="mt-2 text-xs text-warning">
          Accepting removes {dropped.length === 1 ? 'the reference' : 'the references'}{' '}
          {dropped.map((reference) => reference.token).join(', ')}.
        </p>
      )}
    </>
  );
}

/** The suggestion itself: what it would change, and the three answers to it. */
function AiSuggestionCard({ ai, style }: { ai: AiEditing; style: React.CSSProperties }) {
  const pending = ai.pending;
  if (!pending) return null;

  const withdrawn = ai.range === null;
  const blocked = withdrawn || ai.stale;

  return (
    <FloatingPanel style={style} className="w-[360px] p-3" role="dialog" aria-label="AI suggestion">
      <AiPanelHeading>{pending.label}</AiPanelHeading>

      {withdrawn ? (
        <p className="mt-2 text-sm text-muted-foreground">
          The passage this was about is no longer in the document.
        </p>
      ) : (
        <SuggestionBody pending={pending} />
      )}

      {ai.stale && !withdrawn && (
        <p className="mt-2 text-xs text-warning">
          The passage changed while this was being written. Try again to work from what is there
          now.
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        {pending.status === 'ready' && !blocked && (
          <Button size="sm" onClick={ai.accept}>
            Accept
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={ai.reject}>
          {withdrawn ? 'Dismiss' : 'Reject'}
        </Button>
        {pending.status !== 'loading' && !withdrawn && (
          <Button variant="ai" size="sm" onClick={ai.retry}>
            Try again
          </Button>
        )}
      </div>
    </FloatingPanel>
  );
}

export interface AiEditingLayerProps {
  editor: Editor | null;
  options: AiEditingOptions;
  /** The positioned box the panels are placed inside — the editor's own wrapper. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Set by the layer so the `/ai` block can reach it; see `aiSlashCommand`. */
  openPromptRef: React.RefObject<(editor: Editor, range: Range) => void>;
}

/**
 * Inline AI editing for one writing surface: the selection menu, the `/ai`
 * box, and the suggestion card.
 *
 * Everything it shows is drawn *beside* the document. The document itself only
 * changes when a writer accepts, which is why a suggestion in flight cannot be
 * autosaved, exported or versioned by accident.
 */
export function AiEditingLayer({
  editor,
  options,
  containerRef,
  openPromptRef,
}: AiEditingLayerProps) {
  const ai = useAiSuggestion(editor, options);

  const openPrompt = ai.openPrompt;
  React.useEffect(() => {
    openPromptRef.current = openPrompt;
  }, [openPrompt, openPromptRef]);

  if (!editor) return null;

  // A withdrawn suggestion has no passage left to sit under, but the writer
  // still has to be told why it went away.
  if (ai.pending) {
    return (
      <AiSuggestionCard
        ai={ai}
        style={anchorStyle(editor, ai.range ?? { from: 0, to: 0 }, containerRef.current)}
      />
    );
  }
  if (ai.prompt) {
    return <AiPromptBox ai={ai} style={anchorStyle(editor, ai.prompt, containerRef.current)} />;
  }
  if (ai.selection) {
    return (
      <AiSelectionMenu ai={ai} style={anchorStyle(editor, ai.selection, containerRef.current)} />
    );
  }
  return null;
}
