'use client';

import type { DesignChange } from '@level-zero/domain';
import { Button, DifferenceList, EmptyState, Tag } from '@level-zero/ui';
import type { Route } from 'next';
import Link from 'next/link';

import { entityRoute } from '@/features/entity-detail/entity-route';

const CHANGE_LABELS = { added: 'Added', removed: 'Removed', changed: 'Changed' } as const;

/**
 * Section 1 — what the team changed: the entities whose pinned versions moved,
 * and what moved inside each of them.
 *
 * Tuning arrives here already read as `120 s → 90 s`, because the parameters
 * are matched on their stable ids before the view sees them. Every row opens
 * the canonical entity, which is the drill-down from "this changed" to the
 * thing that changed.
 */
export function OutcomeDesignChanges({
  projectId,
  changes,
}: {
  projectId: string;
  changes: readonly DesignChange[];
}) {
  if (changes.length === 0) {
    return (
      <EmptyState
        title="Nothing moved in the design"
        description="Both versions pin the same entity versions, so any difference in what was played is not a difference in what was built."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {changes.map((change) => (
        <li
          key={change.entityId}
          className="flex flex-col gap-2 rounded-md border border-border-subtle bg-raised px-3 py-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">{change.name}</p>
              <Tag>{CHANGE_LABELS[change.change]}</Tag>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-faint-foreground">{pinLabel(change)}</span>
              <Button asChild variant="ghost" size="sm">
                <Link href={entityRoute(projectId, change.entityId) as Route}>Open</Link>
              </Button>
            </div>
          </div>

          {change.change === 'changed' && (
            <DifferenceList
              groups={change.groups}
              emptyLabel="The pinned version moved without anything this view can read moving with it."
            />
          )}
        </li>
      ))}
    </ul>
  );
}

/** `v3 → v4`, or the one side an addition or a removal has. */
function pinLabel(change: DesignChange): string {
  const from = change.from ? `v${change.from.versionNumber}` : null;
  const to = change.to ? `v${change.to.versionNumber}` : null;

  if (from && to) return `${from} → ${to}`;
  return to ?? from ?? 'This pin no longer resolves';
}
