'use client';

import { StatusBadge } from '@level-zero/ui';

import { formatDecidedAt } from '@/features/review/review';

import { assetSelectionBadge, purposeLabel } from './selection';
import { useAssetSelectionHistory } from './use-selection';

/**
 * Everything ever decided about one file, across every context it was
 * considered for.
 *
 * The point of reading it from the file rather than from an entity: a concept
 * turned down as a portrait and kept as costume exploration has two answers, and
 * a rejected one still has its row here long after the grid it was rejected in
 * has gone. Nothing in this list can be edited or removed.
 */
export function AssetDecisionHistory({
  projectId,
  assetId,
}: {
  projectId: string;
  assetId: string;
}) {
  const history = useAssetSelectionHistory(projectId, assetId);

  if (history.isPending || history.isError || history.data.length === 0) return null;

  return (
    <section aria-label="Decisions about this file" className="flex flex-col gap-1.5">
      <h4 className="text-xs font-semibold text-foreground">Decisions about this file</h4>
      <ul className="flex flex-col gap-1">
        {history.data.map((selection) => {
          const badge = assetSelectionBadge(selection.state);

          return (
            <li key={selection.id} className="flex flex-wrap items-center gap-1.5">
              <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
              <span className="text-xs text-muted-foreground">
                as {purposeLabel(selection.context.purpose).toLowerCase()}
              </span>
              <span className="text-xs text-faint-foreground">
                {selection.actor} · {formatDecidedAt(selection.decidedAt)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
