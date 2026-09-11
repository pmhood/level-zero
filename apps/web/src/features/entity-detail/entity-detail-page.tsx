'use client';

import type { Entity } from '@level-zero/domain';
import { Button, EmptyState, HistoryIcon, StatusBadge, WorkspacePage } from '@level-zero/ui';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { entityStatusBadge, entityTypeLabel } from '@/features/entities/entity-presentation';
import { useEntity, useRestoreEntity } from '@/features/entities/use-entities';
import { ApiRequestError, apiErrorMessage } from '@/lib/api';

import { EntityDetailFallback } from './entity-detail-fallback';
import { ENTITY_DETAIL_BODIES } from './entity-detail-renderers';
import { EntityRelationships } from './entity-relationships';
import { entityRoute } from './entity-route';
import { EntityVersionHistory } from './entity-version-history';

/**
 * The canonical entity route (docs/decisions/canonical-entity-routes.md,
 * Model C): a shell that owns identity, project scoping, error states,
 * relationships and history for every entity type, with the per-type body
 * looked up from `ENTITY_DETAIL_BODIES` and falling back to
 * `EntityDetailFallback`.
 *
 * Ids are the address (§8) — the query is by id, never by name, so renaming
 * an entity changes nothing about this URL.
 */
export function EntityDetailPage({ projectId, entityId }: { projectId: string; entityId: string }) {
  const entityQuery = useEntity(projectId, entityId);

  if (entityQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading entity…
      </div>
    );
  }

  if (entityQuery.isError) {
    // A cross-project id resolves to the same NotFoundError as a missing one
    // (EntityService.getById, §2.3) — deliberately: this renders the
    // identical state rather than confirming another project's entity
    // exists (§8).
    const notFound =
      entityQuery.error instanceof ApiRequestError && entityQuery.error.status === 404;

    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          title={notFound ? 'Entity not found' : "Couldn't load this entity"}
          description={
            notFound
              ? "This entity doesn't exist, or you don't have access to it."
              : apiErrorMessage(entityQuery.error)
          }
          actions={
            <Button asChild variant="secondary">
              <Link href={`/projects/${projectId}` as Route}>Back to project</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <EntityDetailShell key={entityQuery.data.id} projectId={projectId} entity={entityQuery.data} />
  );
}

function EntityDetailShell({ projectId, entity }: { projectId: string; entity: Entity }) {
  const router = useRouter();
  const restoreEntity = useRestoreEntity(projectId);
  const archived = entity.status === 'archived';
  const status = entityStatusBadge(entity.status);
  const Body = ENTITY_DETAIL_BODIES[entity.type] ?? EntityDetailFallback;

  function openEntity(referenced: Entity) {
    router.push(entityRoute(projectId, referenced.id) as Route);
  }

  return (
    <WorkspacePage
      title={entity.name}
      description={entityTypeLabel(entity.type)}
      actions={
        <div className="flex items-center gap-2">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {archived && (
            <Button
              variant="secondary"
              size="sm"
              disabled={restoreEntity.isPending}
              onClick={() => restoreEntity.mutate(entity.id)}
            >
              <HistoryIcon className="size-4" />
              {restoreEntity.isPending ? 'Restoring…' : 'Restore'}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-5">
        <Body projectId={projectId} entity={entity} onOpen={openEntity} />
        <EntityRelationships projectId={projectId} entity={entity} />
        <EntityVersionHistory projectId={projectId} entity={entity} />

        {restoreEntity.isError && (
          <p className="text-xs text-error">
            {apiErrorMessage(restoreEntity.error, 'Could not restore this entity.')}
          </p>
        )}
      </div>
    </WorkspacePage>
  );
}
