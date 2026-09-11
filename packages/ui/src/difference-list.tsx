import type { Difference, DifferenceGroup } from '@level-zero/domain';
import * as React from 'react';

import { cn } from './cn';
import { Tag } from './tag';

const CHANGE_LABELS = { added: 'Added', removed: 'Removed', changed: 'Changed' } as const;

export interface DifferenceListProps {
  groups: readonly DifferenceGroup[];
  /** What to say when nothing separates the two things. */
  emptyLabel?: React.ReactNode;
  className?: string;
}

/**
 * What separates two things, grouped and read left to right: `120 s → 90 s`.
 *
 * The rows themselves, without the side-by-side panes `CompareView` wraps
 * them in — because a comparison is not always two panes. A list of entities
 * whose pinned versions moved shows one of these per entity, and it has to
 * read exactly like the differences under a compare view, since it is the
 * same domain rows saying the same thing.
 */
export function DifferenceList({ groups, emptyLabel, className }: DifferenceListProps) {
  if (groups.length === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        {emptyLabel ?? 'These two are the same in every way this view can read.'}
      </p>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <p className="text-xs font-medium text-faint-foreground uppercase">{group.title}</p>
          <dl className="flex flex-col">
            {group.differences.map((difference) => (
              <DifferenceRow key={`${group.title}:${difference.key}`} difference={difference} />
            ))}
          </dl>
        </div>
      ))}
    </div>
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
