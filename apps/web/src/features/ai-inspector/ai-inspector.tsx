'use client';

import type { Entity } from '@level-zero/domain';
import { Button, Field, Input, SparklesIcon, Textarea } from '@level-zero/ui';
import { useId, useState } from 'react';

import { apiErrorMessage, type AiActionResult } from '@/lib/api';

import {
  acceptedIdeaName,
  subjectContext,
  subjectKey,
  subjectLabel,
  type AiSubject,
} from './ai-subject';
import {
  ASK_ACTION_ID,
  ASK_CAPABILITY,
  actionsFor,
  capabilityAvailable,
  type AiInspectorAction,
} from './inspector-actions';
import { ResolvedContextDisclosure } from './resolved-context-disclosure';
import { useAcceptAiActionResult, useAiCapabilities, useRunAiAction } from './use-ai-inspector';

export interface AiInspectorProps {
  projectId: string;
  /** What the workspace currently has selected. */
  subject: AiSubject;
}

/**
 * The contextual AI surface, composed into whichever inspector the user is
 * looking at (spec sections 21, 22 and 56).
 *
 * One component for every workspace rather than a chat panel per tool: what
 * changes between a character, a mechanic, a prototype, a file and no
 * selection at all is the catalogue of questions worth asking, which is a
 * lookup in `inspector-actions.ts` — not a different implementation.
 *
 * Nothing it produces is part of the project. An answer is held here until
 * someone keeps it, and keeping it writes a *new* draft idea beside the
 * subject, so the character or mechanic the question was about is never
 * rewritten by a model.
 */
export function AiInspector(props: AiInspectorProps) {
  // Keyed on the subject, so selecting something else builds a fresh panel
  // rather than carrying the last subject's answer, draft or error into it —
  // the same reason the moodboard's node form is keyed.
  return <ContextualAi key={subjectKey(props.subject)} {...props} />;
}

/** An answer the user has not decided about yet. It lives here, never in the project. */
interface PendingAnswer {
  action: AiInspectorAction;
  result: AiActionResult;
}

function ContextualAi({ projectId, subject }: AiInspectorProps) {
  const capabilitiesQuery = useAiCapabilities(projectId);
  const runAction = useRunAiAction(projectId);
  const acceptResult = useAcceptAiActionResult(projectId);

  const [instruction, setInstruction] = useState('');
  const [includeRelated, setIncludeRelated] = useState(true);
  const [answer, setAnswer] = useState<PendingAnswer | null>(null);
  const [ideaName, setIdeaName] = useState('');
  const [kept, setKept] = useState<Entity | null>(null);

  const askId = useId();
  const relatedId = useId();
  const nameId = useId();

  const label = subjectLabel(subject);
  const capabilities = capabilitiesQuery.data?.capabilities;
  const actions = actionsFor(subject);
  const canAsk = capabilityAvailable(ASK_CAPABILITY, capabilities);

  function run(action: AiInspectorAction): void {
    setAnswer(null);
    setKept(null);
    runAction.mutate(
      {
        action: action.id,
        capability: action.capability,
        instruction: action.instruction,
        ...subjectContext(subject),
        relatedDepth: includeRelated ? 1 : 0,
      },
      {
        onSuccess: (result) => {
          setAnswer({ action, result });
          setIdeaName(acceptedIdeaName(subject, action.label));
        },
      },
    );
  }

  function ask(): void {
    const asked = instruction.trim();
    if (!asked) return;
    run({
      id: ASK_ACTION_ID,
      label: 'Ask',
      hint: '',
      capability: ASK_CAPABILITY,
      instruction: asked,
    });
  }

  function keep(): void {
    if (!answer || !ideaName.trim()) return;
    acceptResult.mutate(
      {
        generationId: answer.result.generationId,
        name: ideaName.trim(),
        text: answer.result.output,
      },
      {
        onSuccess: (idea) => {
          setAnswer(null);
          setKept(idea);
        },
      },
    );
  }

  return (
    <section aria-label="Ask AI" className="flex flex-col gap-3">
      <header>
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-ai-foreground">
          <SparklesIcon className="size-4" />
          Ask AI
        </h3>
        <p className="mt-0.5 text-xs text-faint-foreground">
          About {label}. Nothing is written to the project until you keep it.
        </p>
      </header>

      <Field label="Ask something" htmlFor={askId}>
        <Textarea
          id={askId}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder={`What would you like to know about ${label}?`}
          className="min-h-[64px] text-xs"
        />
      </Field>

      <label htmlFor={relatedId} className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          id={relatedId}
          type="checkbox"
          checked={includeRelated}
          onChange={(event) => setIncludeRelated(event.target.checked)}
          className="size-3.5 accent-[var(--lz-ai)]"
        />
        Include related project objects
      </label>

      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="ai"
          size="sm"
          onClick={ask}
          disabled={!canAsk || instruction.trim().length === 0 || runAction.isPending}
        >
          <SparklesIcon className="size-4" />
          Ask
        </Button>

        {actions.map((action) => {
          const available = capabilityAvailable(action.capability, capabilities);
          return (
            <Button
              key={action.id}
              variant="ai"
              size="sm"
              onClick={() => run(action)}
              disabled={!available || runAction.isPending}
              title={
                available
                  ? action.hint
                  : `Nothing configured here can run ${action.capability} requests.`
              }
            >
              {action.label}
            </Button>
          );
        })}
      </div>

      {runAction.isPending && (
        <p role="status" className="text-xs text-muted-foreground">
          Working through the project context…
        </p>
      )}

      {runAction.isError && (
        <p role="status" className="text-xs text-error">
          {apiErrorMessage(runAction.error, 'The AI request failed.')}
        </p>
      )}

      {answer && (
        <article className="flex flex-col gap-3 rounded-lg border border-[var(--lz-ai-border)] bg-[var(--lz-ai-muted)] p-3">
          <p className="text-xs font-medium text-ai-foreground">{answer.action.label}</p>
          <p className="whitespace-pre-wrap text-xs leading-5 text-foreground">
            {answer.result.output}
          </p>

          <ResolvedContextDisclosure context={answer.result.context} />

          <Field label="Keep as" htmlFor={nameId}>
            <Input
              id={nameId}
              value={ideaName}
              onChange={(event) => setIdeaName(event.target.value)}
              className="h-8 text-xs"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* An ordinary project write, so Level Zero Blue: keeping a
                recommendation is not itself a generative action. */}
            <Button
              variant="primary"
              size="sm"
              onClick={keep}
              disabled={ideaName.trim().length === 0 || acceptResult.isPending}
            >
              {acceptResult.isPending ? 'Keeping…' : 'Keep as idea'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => run(answer.action)}
              disabled={runAction.isPending}
            >
              Try again
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAnswer(null)}>
              Discard
            </Button>
          </div>

          {acceptResult.isError && (
            <p role="status" className="text-xs text-error">
              {apiErrorMessage(acceptResult.error, 'Could not keep this.')}
            </p>
          )}
        </article>
      )}

      {kept && (
        <p role="status" className="text-xs text-muted-foreground">
          Kept as the idea “{kept.name}”, linked back to {label}.
        </p>
      )}
    </section>
  );
}
