'use client';

import type { Entity } from '@level-zero/domain';
import { Inspector, StatusBadge, Tag } from '@level-zero/ui';

import { entityStatusBadge, entityTypeLabel } from './entity-presentation';

/**
 * What clicking a reference opens: the canonical entity behind it, beside the
 * document rather than in place of it, so the sentence that mentioned it stays
 * on screen.
 */
export function EntityReferenceInspector({
  entity,
  onClose,
}: {
  entity: Entity;
  onClose: () => void;
}) {
  const status = entityStatusBadge(entity.status);

  return (
    <Inspector title={entity.name} description={entityTypeLabel(entity.type)} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <StatusBadge tone={status.tone} className="self-start">
          {status.label}
        </StatusBadge>

        <p className="text-xs leading-5 text-muted-foreground">
          {entity.description ?? 'No description yet.'}
        </p>

        {entity.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entity.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        )}
      </div>
    </Inspector>
  );
}
