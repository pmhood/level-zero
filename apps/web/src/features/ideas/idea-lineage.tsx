'use client';

import type { NeighborEdge } from '@level-zero/domain';
import { Tag } from '@level-zero/ui';

import { entityTypeLabel } from '@/features/entities/entity-presentation';

const RELATION_LABELS: Record<string, string> = {
  promoted_to: 'Promoted to',
  contains: 'Contains',
  references: 'References',
  inspired_by: 'Inspired by',
  generated_from: 'Generated from',
  derived_from: 'Derived from',
  depends_on: 'Depends on',
  implements: 'Implements',
  appears_in: 'Appears in',
  belongs_to: 'Belongs to',
  replaces: 'Replaces',
};

function EdgeRow({ edge }: { edge: NeighborEdge }) {
  const label =
    edge.direction === 'outgoing'
      ? (RELATION_LABELS[edge.relationship.relation] ?? edge.relationship.relation)
      : `${RELATION_LABELS[edge.relationship.relation] ?? edge.relationship.relation} by`;

  return (
    <li className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-raised px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-foreground">{edge.entity.name}</p>
        <p className="text-xs text-faint-foreground">
          {label} · {entityTypeLabel(edge.entity.type)}
        </p>
      </div>
      {edge.entity.status === 'archived' && <Tag>Archived</Tag>}
    </li>
  );
}

/** The Links tab: every relationship one hop away from the selected idea. */
export function IdeaLineageList({
  outgoing,
  incoming,
}: {
  outgoing: NeighborEdge[];
  incoming: NeighborEdge[];
}) {
  const edges = [...outgoing, ...incoming];

  if (edges.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No relationships yet. Promoting this idea will link it to what it becomes.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {edges.map((edge) => (
        <EdgeRow key={edge.relationship.id} edge={edge} />
      ))}
    </ul>
  );
}
