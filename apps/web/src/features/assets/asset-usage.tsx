'use client';

import type { AssetSummary } from '@level-zero/domain';
import type { Route } from 'next';
import Link from 'next/link';

import { entityTypeLabel } from '@/features/entities/entity-presentation';
import { entityRoute } from '@/features/entity-detail/entity-route';

/**
 * Who uses this file, and a way to go there.
 *
 * The entities come from the library's own read model (#202), which reaches
 * them through the asset's `asset_reference` entity and its relationships —
 * the same two hops a grid tile's "used by" badge makes. Each one opens the
 * canonical entity route, so the inspector is never a dead end.
 */
export function AssetUsage({
  projectId,
  summary,
}: {
  projectId: string;
  summary: AssetSummary | undefined;
}) {
  const linked = summary?.linkedEntities;

  if (!linked || linked.total === 0) {
    return (
      <p className="text-xs text-faint-foreground">
        Nothing references this file yet. A character, board or document links it from that
        workspace, and it shows up here.
      </p>
    );
  }

  const hidden = linked.total - linked.entities.length;

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {linked.entities.map((entity) => (
          <li key={entity.entityId}>
            <Link
              href={entityRoute(projectId, entity.entityId) as Route}
              className="flex flex-col rounded-md px-2 py-1.5 hover:bg-hover"
            >
              <span className="truncate text-[13px] font-medium text-foreground">
                {entity.name}
              </span>
              <span className="text-xs text-faint-foreground">{entityTypeLabel(entity.type)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="text-xs text-faint-foreground">
          {hidden} more {hidden === 1 ? 'object references' : 'objects reference'} this file.
        </p>
      )}
    </div>
  );
}
