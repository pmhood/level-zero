import type { Difference, DifferenceGroup } from '@level-zero/domain';
import * as React from 'react';

import { cn } from './cn';
import { StatusBadge } from './status-badge';
import { Tag } from './tag';

/** One side of a comparison: what it is, and what it looks like. */
export interface CompareSide {
  /** Identity — `v3`, a snapshot label, a filename. Never an id. */
  label: React.ReactNode;
  /** The line under it: when it was kept, which line of work, who by. */
  meta?: React.ReactNode;
  /** Marks the side that is the working copy right now. */
  current?: boolean;
  /** The pane itself: an image, prose, a parameter list. */
  children: React.ReactNode;
  /** What can be done with *this* side — choosing it, starting from it. */
  actions?: React.ReactNode;
}

export interface CompareViewProps {
  a: CompareSide;
  b: CompareSide;
  /** Pickers and controls for the comparison as a whole, above the panes. */
  toolbar?: React.ReactNode;
  groups: readonly DifferenceGroup[];
  /** What to say when the two sides are the same. */
  sameLabel?: React.ReactNode;
  className?: string;
}

const CHANGE_LABELS = { added: 'Added', removed: 'Removed', changed: 'Changed' } as const;

/**
 * Two things of the same kind, side by side, and what separates them
 * (spec section 61).
 *
 * This is the layout and nothing else: identity, the two panes, the
 * Differences list and whatever actions the surface offers. What counts as a
 * difference is worked out before it gets here — by the domain, per kind of
 * thing — so an entity version, a tuning change, a rewritten document and two
 * pictures all arrive as the same rows and read the same way.
 *
 * Nothing here writes anything. A comparison is a reading until somebody
 * presses one of the actions the surface passed in.
 */
export function CompareView({ a, b, toolbar, groups, sameLabel, className }: CompareViewProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {toolbar}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ComparePane side={a} name="A" />
        <ComparePane side={b} name="B" />
      </div>

      <section aria-label="Differences" className="flex flex-col gap-3">
        <h3 className="text-[15px] font-semibold text-foreground">Differences</h3>

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {sameLabel ?? 'These two are the same in every way this view can read.'}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.title} className="flex flex-col gap-1">
              <p className="text-xs font-medium text-faint-foreground uppercase">{group.title}</p>
              <dl className="flex flex-col">
                {group.differences.map((difference) => (
                  <DifferenceRow key={`${group.title}:${difference.key}`} difference={difference} />
                ))}
              </dl>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function ComparePane({ side, name }: { side: CompareSide; name: 'A' | 'B' }) {
  return (
    <section
      aria-label={`Side ${name}`}
      className="flex min-w-0 flex-col rounded-lg border border-border bg-surface"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-faint-foreground">{name}</p>
          <p className="truncate text-sm font-semibold text-foreground">{side.label}</p>
          {side.meta && <p className="mt-0.5 text-xs text-faint-foreground">{side.meta}</p>}
        </div>
        {side.current && <StatusBadge tone="success">Current</StatusBadge>}
      </header>

      <div className="min-w-0 flex-1 p-4">{side.children}</div>

      {side.actions && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-border-subtle px-4 py-3">
          {side.actions}
        </footer>
      )}
    </section>
  );
}

function DifferenceRow({ difference }: { difference: Difference }) {
  const { label, change, from, to } = difference;

  return (
    <div className="flex flex-col gap-1 border-b border-border-subtle py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="min-w-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-baseline gap-1.5 text-sm sm:justify-end sm:text-right">
        {change !== 'changed' && <Tag>{CHANGE_LABELS[change]}</Tag>}
        {from !== null && <span className="text-faint-foreground">{from}</span>}
        {from !== null && to !== null && (
          <>
            <span className="sr-only">changed to</span>
            <span aria-hidden="true" className="text-faint-foreground">
              →
            </span>
          </>
        )}
        {to !== null && <span className="font-medium text-foreground">{to}</span>}
      </dd>
    </div>
  );
}
