'use client';

import type { MetricSummary, OutcomeComparison, Playtest } from '@level-zero/domain';
import { Button, EmptyState, Tag } from '@level-zero/ui';

const CHANGE_LABELS = { added: 'Added', removed: 'Removed', changed: 'Changed' } as const;

/**
 * Section 2 — what was measured, and how much measuring is behind it.
 *
 * The sample counts are shown beside every figure rather than only where they
 * disagree: a mean of two sessions and a mean of twelve read identically
 * otherwise, and reading them as equal evidence is the mistake this whole
 * surface exists to avoid. Each side's playtests are named and open in the
 * Playtests tab for that version, so a number can be followed to the records
 * it came from.
 */
export function OutcomeMetricChanges({
  comparison,
  onOpenPlaytests,
}: {
  comparison: OutcomeComparison;
  onOpenPlaytests: (prototypeVersionId: string) => void;
}) {
  if (comparison.metricChanges.length === 0) {
    return (
      <EmptyState
        title="Nothing measured to compare"
        description="Record metrics against a playtest of each version — completion rate, session duration — and what moved shows up here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {comparison.metricChanges.map((change) => (
        <li
          key={change.difference.key}
          className="flex flex-col gap-2 rounded-md border border-border-subtle bg-raised px-3 py-2.5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm text-muted-foreground">{change.difference.label}</p>
              {change.difference.change !== 'changed' && (
                <Tag>{CHANGE_LABELS[change.difference.change]}</Tag>
              )}
            </div>

            <p className="flex items-baseline gap-1.5 text-sm">
              <span className="text-faint-foreground">
                {change.difference.from ?? 'Not measured'}
              </span>
              <span aria-hidden="true" className="text-faint-foreground">
                →
              </span>
              <span className="font-medium text-foreground">
                {change.difference.to ?? 'Not measured'}
              </span>
            </p>
          </div>

          <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
            <Source
              side="A"
              summary={change.from}
              playtests={comparison.from.playtests}
              onOpen={() => onOpenPlaytests(comparison.from.version.id)}
            />
            <Source
              side="B"
              summary={change.to}
              playtests={comparison.to.playtests}
              onOpen={() => onOpenPlaytests(comparison.to.version.id)}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Source({
  side,
  summary,
  playtests,
  onOpen,
}: {
  side: 'A' | 'B';
  summary: MetricSummary | null;
  playtests: readonly Playtest[];
  onOpen: () => void;
}) {
  if (!summary) {
    return <p className="text-xs text-faint-foreground">{side}: not measured</p>;
  }

  const sources = playtests.filter((playtest) => summary.playtestIds.includes(playtest.id));

  return (
    <p className="flex flex-wrap items-baseline gap-1 text-xs text-faint-foreground">
      <span>
        {side}: mean of {count(summary.sampleCount, 'measurement')} in
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
        {sources.map((playtest) => playtest.name).join(', ') || 'its playtests'}
      </Button>
    </p>
  );
}

function count(total: number, noun: string): string {
  return `${total} ${noun}${total === 1 ? '' : 's'}`;
}
