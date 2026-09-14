'use client';

import type { Generation } from '@level-zero/domain';
import { Button, EmptyState, Panel, SectionPanel, SparklesIcon, StatusBadge } from '@level-zero/ui';
import type { Route } from 'next';
import Link from 'next/link';
import { useState } from 'react';

import { apiErrorMessage } from '@/lib/api';

import { capabilityLabel, elapsedLabel, elapsedSince, failureText } from './generation';
import { useCancelGeneration, useGenerationQueue } from './use-generation';

export interface GenerationQueuePanelProps {
  projectId: string;
}

/**
 * The Generation Queue (issue #180, split from #166): what this project has
 * generating right now, so the Asset Library says that six more assets are
 * coming rather than only showing the ones already here.
 *
 * Read straight off `Generation` — capability, status, timestamps, failure —
 * never a second progress model. A multi-output generation reports no
 * partial completion until it finishes, so a running row says "Generating…"
 * rather than inventing a fraction the record doesn't have.
 *
 * This panel never starts a generation; that is the Generate panel's job
 * (`GenerationPanel`), wherever a workspace embeds one. "View All" goes to
 * the project's Search, scoped to generations — the surface that already
 * lists them — rather than a second history view built for this panel.
 */
export function GenerationQueuePanel({ projectId }: GenerationQueuePanelProps) {
  const queue = useGenerationQueue(projectId);
  const cancel = useCancelGeneration(projectId);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(new Set());

  const items = (queue.data ?? []).filter((generation) => !dismissedIds.has(generation.id));

  function dismiss(generationId: string): void {
    setDismissedIds((current) => new Set(current).add(generationId));
  }

  function cancelGeneration(generationId: string): void {
    setCancellingId(generationId);
    cancel.mutate(generationId, { onSettled: () => setCancellingId(null) });
  }

  return (
    <SectionPanel
      title="Generation Queue"
      description={
        items.length > 0
          ? `${items.length} ${items.length === 1 ? 'generation' : 'generations'}`
          : undefined
      }
      actions={
        <Link
          href={`/projects/${projectId}/search?sourceType=generation` as Route}
          className="text-xs font-medium text-primary hover:underline"
        >
          View All →
        </Link>
      }
    >
      {queue.isError ? (
        <p className="text-xs text-error">
          {apiErrorMessage(queue.error, "Couldn't load the generation queue.")}
        </p>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing generating"
          description="Start a generation from a workspace's Generate panel — queued and running work shows up here, and finished results land straight in the library."
          className="border-none p-0 py-4"
        />
      ) : (
        <Panel className="divide-y divide-border-subtle overflow-hidden">
          {items.map((generation) => (
            <GenerationQueueRow
              key={generation.id}
              generation={generation}
              cancelling={cancellingId === generation.id}
              onCancel={() => cancelGeneration(generation.id)}
              onDismiss={() => dismiss(generation.id)}
            />
          ))}
        </Panel>
      )}
    </SectionPanel>
  );
}

function GenerationQueueRow({
  generation,
  cancelling,
  onCancel,
  onDismiss,
}: {
  generation: Generation;
  cancelling: boolean;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const failed = generation.status === 'failed';

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <SparklesIcon className="size-4 shrink-0 text-ai-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">{capabilityLabel(generation.capability)}</p>
          {failed ? (
            <p className="truncate text-xs text-error">{failureText(generation)}</p>
          ) : (
            <p className="truncate text-xs text-faint-foreground">
              {generation.status === 'running' ? 'Generating…' : 'Queued'}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {!failed && <StatusBadge tone="neutral">{elapsedLabel(elapsedSince(generation))}</StatusBadge>}
        {failed ? (
          <Button type="button" variant="secondary" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={cancelling}
            onClick={onCancel}
          >
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </Button>
        )}
      </div>
    </div>
  );
}
