'use client';

import type { Entity, EntityNeighborhood } from '@level-zero/domain';
import { Button, Tag } from '@level-zero/ui';
import type { Route } from 'next';
import Link from 'next/link';

import { entityTypeLabel, relationLabel } from '@/features/entities/entity-presentation';
import { useEntityNeighborhood } from '@/features/entities/use-entities';
import { apiErrorMessage } from '@/lib/api';

import { entityRoute } from './entity-route';

/**
 * Everything one hop from this entity, for every type
 * (docs/decisions/canonical-entity-routes.md §7, §8) — the shell's job, not
 * the body's. Read-only: drawing and removing edges stays where it already
 * is, in each workspace's own inspector.
 */
export function EntityRelationships({ projectId, entity }: { projectId: string; entity: Entity }) {
  const neighborhood = useEntityNeighborhood(projectId, entity.id);

  return (
    <section aria-label="Relationships" className="flex flex-col gap-3">
      <h3 className="text-xs font-medium text-muted-foreground">Relationships</h3>

      {neighborhood.isPending && (
        <p className="text-sm text-muted-foreground">Loading relationships…</p>
      )}

      {neighborhood.isError && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-error">{apiErrorMessage(neighborhood.error)}</p>
          <Button variant="secondary" size="sm" onClick={() => void neighborhood.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {neighborhood.data && (
        <RelationshipList projectId={projectId} neighborhood={neighborhood.data} />
      )}
    </section>
  );
}

function RelationshipList({
  projectId,
  neighborhood,
}: {
  projectId: string;
  neighborhood: EntityNeighborhood;
}) {
  const edges = [...neighborhood.outgoing, ...neighborhood.incoming];

  if (edges.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing linked yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {edges.map((edge) => (
        <li key={edge.relationship.id}>
          <Link
            href={entityRoute(projectId, edge.entity.id) as Route}
            className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-raised px-3 py-2 hover:border-border"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{edge.entity.name}</p>
              <p className="text-xs text-faint-foreground">
                {edge.direction === 'outgoing'
                  ? relationLabel(edge.relationship.relation)
                  : `${relationLabel(edge.relationship.relation)} by`}
                {' · '}
                {entityTypeLabel(edge.entity.type)}
              </p>
            </div>
            {edge.entity.status === 'archived' && <Tag>Archived</Tag>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
