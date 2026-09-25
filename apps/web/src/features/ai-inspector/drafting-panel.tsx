'use client';

import type { Entity } from '@level-zero/domain';
import { Button, Field, SparklesIcon, Tabs, Textarea } from '@level-zero/ui';
import { useId, useState } from 'react';

import { apiErrorMessage, type AiActionResult } from '@/lib/api';

import { subjectLabel } from './ai-subject';
import { DesignProse } from './design-prose';
import {
  DRAFTING_SUGGESTIONS,
  DRAFTING_TABS,
  frameDraftingRequest,
  type DraftingTab,
} from './drafting-requests';
import {
  ASK_CAPABILITY,
  capabilityAvailable,
  runAiActionInput,
  type AiInspectorAction,
} from './inspector-actions';
import { ResolvedContextDisclosure } from './resolved-context-disclosure';
import { useAiCapabilities, useRunAiAction } from './use-ai-inspector';

export interface DraftingPanelProps {
  projectId: string;
  subject: { kind: 'entity'; entity: Entity; excerpt?: string | null };
}

/** One drafted answer, held here until the next request replaces it. */
interface DraftAnswer {
  result: AiActionResult;
}

/**
 * The AI Drafting Assistant (#260): `AiInspector` for a design document,
 * reframed around the mockup's tabs and standing suggestions rather than a
 * second AI system next to it (#167 — the tabs are framings of one request,
 * not four pipelines).
 *
 * "Insert to Document" and thumbs up/down are later issues: an answer stays
 * here, formatted and copyable, until the next request replaces it.
 */
export function DraftingPanel({ projectId, subject }: DraftingPanelProps) {
  const capabilitiesQuery = useAiCapabilities(projectId);
  const runAction = useRunAiAction(projectId);

  const [tab, setTab] = useState<DraftingTab>('chat');
  const [request, setRequest] = useState('');
  const [answer, setAnswer] = useState<DraftAnswer | null>(null);
  const [copied, setCopied] = useState(false);

  const askId = useId();
  const label = subjectLabel(subject);
  const activeTab = DRAFTING_TABS.find((item) => item.value === tab) ?? DRAFTING_TABS[0];
  const canAsk = capabilityAvailable(ASK_CAPABILITY, capabilitiesQuery.data?.capabilities);

  function runInstruction(action: AiInspectorAction): void {
    setCopied(false);
    runAction.mutate(runAiActionInput(action, subject, 1), {
      onSuccess: (result) => setAnswer({ result }),
    });
  }

  function submit(): void {
    const asked = request.trim();
    if (!asked) return;
    runInstruction({
      id: `draft-${tab}`,
      label: activeTab.label,
      hint: '',
      capability: ASK_CAPABILITY,
      instruction: frameDraftingRequest(tab, asked),
    });
  }

  async function copyAnswer(): Promise<void> {
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(answer.result.output);
      setCopied(true);
    } catch {
      // Clipboard access can be denied by the browser; there is nothing to
      // recover into beyond leaving the text selectable on screen.
    }
  }

  return (
    <section aria-label="AI drafting assistant" className="flex flex-col gap-3">
      <header>
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-ai-foreground">
          <SparklesIcon className="size-4" />
          AI Drafting Assistant
        </h3>
        <p className="mt-0.5 text-xs text-faint-foreground">
          Turn ideas into {label}. Nothing is written to the document until you copy an answer in.
        </p>
      </header>

      <Tabs
        items={DRAFTING_TABS.map(({ value, label: tabLabel }) => ({ value, label: tabLabel }))}
        value={tab}
        onChange={(value) => setTab(value as DraftingTab)}
      />

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
          <DesignProse text={answer.result.output} />

          <ResolvedContextDisclosure context={answer.result.context} />

          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="ai" size="sm" onClick={copyAnswer}>
              Copy
            </Button>
            {copied && (
              <span role="status" className="text-xs text-muted-foreground">
                Copied.
              </span>
            )}
          </div>
        </article>
      )}

      <div className="flex flex-col gap-1.5">
        {DRAFTING_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.id}
            type="button"
            onClick={() => runInstruction(suggestion)}
            disabled={!canAsk || runAction.isPending}
            title={suggestion.hint}
            className="rounded-md border border-[var(--lz-ai-border)] px-2.5 py-1.5 text-left text-xs text-ai-foreground transition-colors duration-150 hover:bg-[var(--lz-ai-muted)] disabled:pointer-events-none disabled:opacity-50"
          >
            {suggestion.label}
          </button>
        ))}
      </div>

      <Field label={activeTab.label} htmlFor={askId}>
        <Textarea
          id={askId}
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          placeholder={activeTab.placeholder}
          className="min-h-[64px] text-xs"
        />
      </Field>

      <Button
        variant="ai"
        size="sm"
        onClick={submit}
        disabled={!canAsk || request.trim().length === 0 || runAction.isPending}
      >
        <SparklesIcon className="size-4" />
        Send
      </Button>
    </section>
  );
}
