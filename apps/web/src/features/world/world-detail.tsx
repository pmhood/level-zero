'use client';

import type { Entity } from '@level-zero/domain';
import { StatusBadge, Tag } from '@level-zero/ui';

import { entityTypeLabel } from '@/features/entities/entity-presentation';

import { WorldDetailBody } from './world-detail-body';
import { canonStatusBadge, readWorld, riskLabel } from './world';

/**
 * The centre column: a world entity's header, plus its tabs and panels in
 * {@link WorldDetailBody}.
 */
export function WorldDetail({
  projectId,
  entity,
  onOpenReference,
}: {
  projectId: string;
  entity: Entity;
  onOpenReference: (referenced: Entity) => void;
}) {
  const archived = entity.status === 'archived';
  const saved = readWorld(entity);
  const canon = canonStatusBadge(saved.canonStatus);

  return (
    <section aria-label="World detail" className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-foreground">{entity.name}</h2>
          <p className="mt-0.5 text-xs text-faint-foreground">
            {entityTypeLabel(entity.type)}
            {saved.era && ` · ${saved.era}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {archived && <Tag>Archived</Tag>}
          {saved.risk !== 'none' && <Tag>{riskLabel(saved.risk)}</Tag>}
          <StatusBadge tone={canon.tone}>{canon.label}</StatusBadge>
        </div>
      </header>

      <WorldDetailBody projectId={projectId} entity={entity} onOpenReference={onOpenReference} />
    </section>
  );
}
