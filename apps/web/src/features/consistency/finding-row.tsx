'use client';

import type { Finding, FindingOrigin } from '@level-zero/domain';
import { Button, SparklesIcon, StatusBadge, Tag, cn } from '@level-zero/ui';
import { useState } from 'react';

import { GenerationProvenanceDetails } from '@/features/generation/generation-provenance';
import { useGeneration } from '@/features/generation/use-generation';
import { apiErrorMessage } from '@/lib/api';

import { checkTitle, formatTimestamp, severityLabel, severityTone } from './consistency';
import { FindingEvidenceRow } from './finding-evidence-row';
import { useDismissFinding, useReopenFinding } from './use-findings';

/**
 * Free text until authentication lands; then it comes from the session — the
 * same placeholder `CreatePrototypeVersionDto.createdBy` uses, because this
 * app has no signed-in user yet.
 */
const DISMISSED_BY = 'You';

/**
 * One finding as the last scan saw it: what it says, every canonical object
 * it cites, and what a person may do about it.
 *
 * Nothing here writes to the objects a finding is about — dismiss and
 * undismiss only ever touch the finding's own lifecycle (§3.2, §4.4). There
 * is no "fix it" action, deliberately: the issue is explicit that nothing in
 * this UI may rewrite canonical data to resolve a finding.
 */
export function FindingRow({ projectId, finding }: { projectId: string; finding: Finding }) {
  const dismiss = useDismissFinding(projectId);
  const reopen = useReopenFinding(projectId);
  const [showReasoning, setShowReasoning] = useState(false);

  return (
    <li className="flex flex-col gap-2.5 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={severityTone(finding.severity)}>
          {severityLabel(finding.severity)}
        </StatusBadge>
        <OriginTag origin={finding.origin} />
        {finding.status === 'dismissed' && <Tag>Dismissed</Tag>}
        {finding.status === 'resolved' && <StatusBadge tone="success">Resolved</StatusBadge>}
        <span className="text-xs text-faint-foreground">{checkTitle(finding.checkId)}</span>
      </div>

      <p className="text-sm text-foreground">{finding.summary}</p>

      <ul className="divide-y divide-border-subtle">
        {finding.evidence.map((evidence, index) => (
          <FindingEvidenceRow
            key={`${evidence.entityId}-${index}`}
            projectId={projectId}
            evidence={evidence}
          />
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        {finding.status === 'open' && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={dismiss.isPending}
            onClick={() =>
              dismiss.mutate({ findingId: finding.id, dismissedBy: DISMISSED_BY })
            }
          >
            {dismiss.isPending ? 'Dismissing…' : 'Dismiss'}
          </Button>
        )}

        {finding.status === 'dismissed' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={reopen.isPending}
            onClick={() => reopen.mutate(finding.id)}
          >
            {reopen.isPending ? 'Undismissing…' : 'Undismiss'}
          </Button>
        )}

        {finding.origin === 'ai_assisted' && finding.generationId && (
          <Button
            type="button"
            variant="ai"
            size="sm"
            onClick={() => setShowReasoning((open) => !open)}
          >
            <SparklesIcon className="size-4" />
            {showReasoning ? 'Hide AI reasoning' : 'Show AI reasoning'}
          </Button>
        )}
      </div>

      {dismiss.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(dismiss.error, 'Could not dismiss this finding.')}
        </p>
      )}
      {reopen.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(reopen.error, 'Could not undismiss this finding.')}
        </p>
      )}

      {showReasoning && finding.generationId && (
        <AiReasoning projectId={projectId} generationId={finding.generationId} />
      )}

      <p className="text-xs text-faint-foreground">
        Last seen by a scan {formatTimestamp(finding.lastSeenAt)}
        {finding.status === 'resolved' && finding.resolvedAt
          ? ` — resolved ${formatTimestamp(finding.resolvedAt)}`
          : null}
      </p>
    </li>
  );
}

function OriginTag({ origin }: { origin: FindingOrigin }) {
  if (origin === 'ai_assisted') {
    return (
      <Tag
        className={cn(
          'gap-1 border-[var(--lz-ai-border)] bg-[var(--lz-ai-muted)] text-ai-foreground',
        )}
      >
        <SparklesIcon className="size-3" />
        AI-assisted
      </Tag>
    );
  }

  return <Tag>Deterministic</Tag>;
}

/**
 * The judgement behind an AI-assisted finding, read from the `Generation`
 * that produced it rather than a new model call — the finding already
 * carries a completed generation (§9), so "ask AI" here means showing that
 * reasoning, not asking again.
 */
function AiReasoning({ projectId, generationId }: { projectId: string; generationId: string }) {
  const generationQuery = useGeneration(projectId, generationId);

  if (generationQuery.isPending) {
    return <p className="text-xs text-faint-foreground">Reading the AI’s reasoning…</p>;
  }

  if (generationQuery.isError) {
    return (
      <p className="text-xs text-error">
        {apiErrorMessage(generationQuery.error, 'Could not read the AI’s reasoning.')}
      </p>
    );
  }

  return (
    <div className="rounded-md border border-[var(--lz-ai-border)] bg-[var(--lz-ai-muted)] p-3">
      <GenerationProvenanceDetails projectId={projectId} generation={generationQuery.data} />
    </div>
  );
}
