'use client';

import {
  isLineageRelation,
  type Entity,
  type NeighborEdge,
  type RelationType,
} from '@level-zero/domain';
import { Button, Field, LinkIcon, Select, Tag } from '@level-zero/ui';
import { useState } from 'react';

import { entityTypeLabel, relationLabel } from '@/features/entities/entity-presentation';
import { useReferenceableEntities } from '@/features/entities/use-entities';
import { apiErrorMessage } from '@/lib/api';

import { useLinkMechanic, useMechanicLinks, useUnlinkMechanic } from './use-mechanics';

/**
 * The relations a designer can draw by hand.
 *
 * Lineage relations are left out on purpose: they record how something came to
 * exist and are written by promotion and generation, not chosen from a menu.
 */
const LINKABLE_RELATIONS = [
  'depends_on',
  'references',
  'contains',
  'implements',
  'appears_in',
  'belongs_to',
] as const satisfies readonly RelationType[];

function EdgeRow({
  edge,
  onUnlink,
  unlinking,
}: {
  edge: NeighborEdge;
  onUnlink: (relationshipId: string) => void;
  unlinking: boolean;
}) {
  const label =
    edge.direction === 'outgoing'
      ? relationLabel(edge.relationship.relation)
      : `${relationLabel(edge.relationship.relation)} by`;

  // Lineage is history: the API refuses to unlink it, so nothing offers to.
  const removable = edge.direction === 'outgoing' && !isLineageRelation(edge.relationship.relation);

  return (
    <li className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-raised px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-foreground">{edge.entity.name}</p>
        <p className="text-xs text-faint-foreground">
          {label} · {entityTypeLabel(edge.entity.type)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {edge.entity.status === 'archived' && <Tag>Archived</Tag>}
        {removable && (
          <Button
            variant="ghost"
            size="sm"
            disabled={unlinking}
            onClick={() => onUnlink(edge.relationship.id)}
          >
            Unlink
          </Button>
        )}
      </div>
    </li>
  );
}

function LinkForm({ projectId, mechanic }: { projectId: string; mechanic: Entity }) {
  const [relation, setRelation] = useState<RelationType>('depends_on');
  const [targetId, setTargetId] = useState('');
  const entitiesQuery = useReferenceableEntities(projectId);
  const linkMechanic = useLinkMechanic(projectId);

  const targets = (entitiesQuery.data?.items ?? []).filter(
    (candidate) => candidate.id !== mechanic.id && candidate.status !== 'archived',
  );

  return (
    <form
      className="flex flex-col gap-2 border-t border-border-subtle pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!targetId) return;
        linkMechanic.mutate(
          { entityId: mechanic.id, input: { targetEntityId: targetId, relation } },
          { onSuccess: () => setTargetId('') },
        );
      }}
    >
      <Field label="Link this mechanic">
        <Select
          aria-label="Relation"
          value={relation}
          onChange={(event) => setRelation(event.target.value as RelationType)}
        >
          {LINKABLE_RELATIONS.map((option) => (
            <option key={option} value={option}>
              {relationLabel(option)}
            </option>
          ))}
        </Select>
      </Field>

      <Select
        aria-label="Entity to link"
        value={targetId}
        onChange={(event) => setTargetId(event.target.value)}
      >
        <option value="">Choose an entity…</option>
        {targets.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name} · {entityTypeLabel(candidate.type)}
          </option>
        ))}
      </Select>

      {linkMechanic.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(linkMechanic.error, 'Could not create that link.')}
        </p>
      )}

      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={!targetId || linkMechanic.isPending}
      >
        <LinkIcon className="size-4" />
        {linkMechanic.isPending ? 'Linking…' : 'Add link'}
      </Button>
    </form>
  );
}

/** Everything one hop from this mechanic, and the way to add another edge. */
export function MechanicLinks({ projectId, mechanic }: { projectId: string; mechanic: Entity }) {
  const links = useMechanicLinks(projectId, mechanic.id);
  const unlinkMechanic = useUnlinkMechanic(projectId);

  if (links.isPending) {
    return <p className="text-sm text-muted-foreground">Loading relationships…</p>;
  }

  if (links.isError) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-error">{apiErrorMessage(links.error)}</p>
        <Button variant="secondary" size="sm" onClick={() => links.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const edges = [...links.data.outgoing, ...links.data.incoming];

  return (
    <div className="flex flex-col gap-4">
      {edges.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing linked yet. Systems are worth more connected — say what this depends on, or what
          it feeds.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {edges.map((edge) => (
            <EdgeRow
              key={edge.relationship.id}
              edge={edge}
              unlinking={unlinkMechanic.isPending}
              onUnlink={(relationshipId) =>
                unlinkMechanic.mutate({ entityId: mechanic.id, relationshipId })
              }
            />
          ))}
        </ul>
      )}

      {unlinkMechanic.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(unlinkMechanic.error, 'Could not remove that link.')}
        </p>
      )}

      {mechanic.status !== 'archived' && <LinkForm projectId={projectId} mechanic={mechanic} />}
    </div>
  );
}
