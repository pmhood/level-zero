'use client';

import type { Entity } from '@level-zero/domain';
import { StatusBadge, Tag } from '@level-zero/ui';

import { entityTypeLabel } from '@/features/entities/entity-presentation';

import { MechanicDetailBody } from './mechanic-detail-body';
import { implementationStatusBadge, mechanicAreaLabel, readMechanic } from './mechanic';

/**
 * The centre column: a mechanic's header, plus its tabs and panels in
 * {@link MechanicDetailBody}.
 */
export function MechanicDetail({ projectId, mechanic }: { projectId: string; mechanic: Entity }) {
  const archived = mechanic.status === 'archived';
  const saved = readMechanic(mechanic);
  const progress = implementationStatusBadge(saved.implementationStatus);

  return (
    <section aria-label="Mechanic detail" className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-foreground">{mechanic.name}</h2>
          <p className="mt-0.5 text-xs text-faint-foreground">
            {entityTypeLabel(mechanic.type)} · {mechanicAreaLabel(saved.area)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {archived && <Tag>Archived</Tag>}
          <StatusBadge tone={progress.tone}>{progress.label}</StatusBadge>
        </div>
      </header>

      <MechanicDetailBody projectId={projectId} mechanic={mechanic} />
    </section>
  );
}
