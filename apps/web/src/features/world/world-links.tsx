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

import { WORLD_LINK_RELATIONS } from './world';
import { useLinkWorldEntity, useUnlinkWorldEntity, useWorldLinks } from './use-world';

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

function LinkForm({ projectId, entity }: { projectId: string; entity: Entity }) {
  const [relation, setRelation] = useState<RelationType>('controls');
  const [targetId, setTargetId] = useState('');
  const entitiesQuery = useReferenceableEntities(projectId);
  const linkEntity = useLinkWorldEntity(projectId);

  const targets = (entitiesQuery.data?.items ?? []).filter(
    (candidate) => candidate.id !== entity.id && candidate.status !== 'archived',
  );

  return (
    <form
      className="flex flex-col gap-2 border-t border-border-subtle pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!targetId) return;
        linkEntity.mutate(
          { entityId: entity.id, input: { targetEntityId: targetId, relation } },
          { onSuccess: () => setTargetId('') },
        );
      }}
    >
      <Field label={`Link ${entity.name}`} hint="Edges read source-first, from this entity out.">
        <Select
          aria-label="Relation"
          value={relation}
          onChange={(event) => setRelation(event.target.value as RelationType)}
        >
          {WORLD_LINK_RELATIONS.map((option) => (
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

      {linkEntity.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(linkEntity.error, 'Could not create that link.')}
        </p>
      )}

      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={!targetId || linkEntity.isPending}
      >
        <LinkIcon className="size-4" />
        {linkEntity.isPending ? 'Linking…' : 'Add link'}
      </Button>
    </form>
  );
}

/** Everything one hop from this entity, and the way to draw another edge. */
export function WorldLinks({ projectId, entity }: { projectId: string; entity: Entity }) {
  const links = useWorldLinks(projectId, entity.id);
  const unlinkEntity = useUnlinkWorldEntity(projectId);

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
          Nothing linked yet. A setting is the links — say who holds this, what is inside it, or
          what shows up here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {edges.map((edge) => (
            <EdgeRow
              key={edge.relationship.id}
              edge={edge}
              unlinking={unlinkEntity.isPending}
              onUnlink={(relationshipId) =>
                unlinkEntity.mutate({ entityId: entity.id, relationshipId })
              }
            />
          ))}
        </ul>
      )}

      {unlinkEntity.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(unlinkEntity.error, 'Could not remove that link.')}
        </p>
      )}

      {entity.status !== 'archived' && <LinkForm projectId={projectId} entity={entity} />}
    </div>
  );
}
