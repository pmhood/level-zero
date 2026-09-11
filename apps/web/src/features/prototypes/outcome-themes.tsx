'use client';

import type { CategoryGroup, PlaytestFeedback, PlaytestObservation } from '@level-zero/domain';
import { Button, EmptyState, StatusBadge, Tag } from '@level-zero/ui';
import { useState, type ReactNode } from 'react';

/** The label for rows nobody filed under a category. */
export const UNCATEGORIZED = 'Uncategorised';

/** One remark, reduced to what a theme shows: the words, and who or when. */
export interface ThemeEntry {
  id: string;
  /** Verbatim. A theme is a way into the prose, never a replacement for it. */
  body: string;
  meta: ReactNode;
}

/**
 * Sections 3 and 4 — what people said and what the team saw, grouped by the
 * categories they were filed under.
 *
 * The category picker narrows the list without touching the rows: every
 * remark is still its own words, its own author and its own side, which is
 * what "grouped by category without losing raw source text" asks for. A
 * category with nothing on side A is a theme that appeared with this version.
 */
export function OutcomeThemes({
  themes,
  emptyTitle,
  emptyDescription,
}: {
  themes: readonly CategoryGroup<ThemeEntry>[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  const [category, setCategory] = useState<string | null | undefined>(undefined);

  if (themes.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const shown = themes.filter((theme) => category === undefined || theme.category === category);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant={category === undefined ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setCategory(undefined)}
        >
          All
        </Button>
        {themes.map((theme) => (
          <Button
            key={theme.category ?? UNCATEGORIZED}
            type="button"
            variant={category === theme.category ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setCategory(theme.category)}
          >
            {theme.category ?? UNCATEGORIZED} ({theme.from.length + theme.to.length})
          </Button>
        ))}
      </div>

      {shown.map((theme) => (
        <section
          key={theme.category ?? UNCATEGORIZED}
          aria-label={theme.category ?? UNCATEGORIZED}
          className="flex flex-col gap-2 rounded-md border border-border-subtle bg-raised px-3 py-2.5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{theme.category ?? UNCATEGORIZED}</p>
            <Tag>
              {theme.from.length} on A · {theme.to.length} on B
            </Tag>
            {theme.from.length === 0 && <StatusBadge tone="warning">New in B</StatusBadge>}
          </div>

          <Side label="A" entries={theme.from} />
          <Side label="B" entries={theme.to} />
        </section>
      ))}
    </div>
  );
}

function Side({ label, entries }: { label: 'A' | 'B'; entries: readonly ThemeEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-0.5">
          <p className="text-sm text-foreground">
            <span className="mr-1.5 text-xs text-faint-foreground">{label}</span>
            {entry.body}
          </p>
          <p className="text-xs text-faint-foreground">{entry.meta}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Participant prose: who said it, how it read, and the playtest it was said
 * in — which is the way back from a theme to the record underneath it.
 */
export function feedbackEntries(
  themes: readonly CategoryGroup<PlaytestFeedback>[],
  playtestNames: ReadonlyMap<string, string>,
): CategoryGroup<ThemeEntry>[] {
  return mapThemes(themes, (feedback) => ({
    id: feedback.id,
    body: feedback.body,
    meta: meta([
      feedback.author ?? 'Participant',
      feedback.sentiment,
      playtestNames.get(feedback.playtestId),
    ]),
  }));
}

/** The team's own notes: who saw it, how far into the run, and where. */
export function observationEntries(
  themes: readonly CategoryGroup<PlaytestObservation>[],
  playtestNames: ReadonlyMap<string, string>,
): CategoryGroup<ThemeEntry>[] {
  return mapThemes(themes, (observation) => ({
    id: observation.id,
    body: observation.body,
    meta: meta([
      observation.observedBy ?? 'Observer',
      observation.atSeconds === null ? null : `${observation.atSeconds}s in`,
      playtestNames.get(observation.playtestId),
    ]),
  }));
}

function mapThemes<TItem>(
  themes: readonly CategoryGroup<TItem>[],
  entry: (item: TItem) => ThemeEntry,
): CategoryGroup<ThemeEntry>[] {
  return themes.map((theme) => ({
    category: theme.category,
    from: theme.from.map(entry),
    to: theme.to.map(entry),
  }));
}

function meta(parts: readonly (string | null | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join(' · ');
}
