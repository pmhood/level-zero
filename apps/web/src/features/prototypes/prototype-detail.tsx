import type { Entity } from '@level-zero/domain';
import { StatusBadge } from '@level-zero/ui';

import { entityStatusBadge, entityTypeLabel } from '@/features/entities/entity-presentation';

import { PrototypeDetailBody } from './prototype-detail-body';

/**
 * The centre column: a prototype's header, plus its version strip and tabs
 * in {@link PrototypeDetailBody}.
 */
export function PrototypeDetail({
  projectId,
  prototype,
}: {
  projectId: string;
  prototype: Entity;
}) {
  const status = entityStatusBadge(prototype.status);

  return (
    <section aria-label="Prototype detail" className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-foreground">{prototype.name}</h2>
          <p className="mt-0.5 text-xs text-faint-foreground">{entityTypeLabel(prototype.type)}</p>
        </div>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </header>

      <div className="px-5 py-4">
        <PrototypeDetailBody projectId={projectId} entity={prototype} />
      </div>
    </section>
  );
}
