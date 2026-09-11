'use client';

import type { Entity, EntityHistory } from '@level-zero/domain';
import { Button, StatusBadge } from '@level-zero/ui';

import { versionReasonLabel } from '@/features/entities/entity-presentation';
import { useEntityHistory } from '@/features/entities/use-entity-versions';
import { apiErrorMessage } from '@/lib/api';

/**
 * The entity's saved versions, for every type (§7, §8) — read-only here.
 * Saving, restoring and comparing versions stay in each workspace's own
 * surfaces; this is the record that they exist.
 */
export function EntityVersionHistory({ projectId, entity }: { projectId: string; entity: Entity }) {
  const history = useEntityHistory(projectId, entity.id);

  return (
    <section aria-label="Version history" className="flex flex-col gap-3">
      <h3 className="text-xs font-medium text-muted-foreground">History</h3>

      {history.isPending && <p className="text-sm text-muted-foreground">Loading history…</p>}

      {history.isError && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-error">{apiErrorMessage(history.error)}</p>
          <Button variant="secondary" size="sm" onClick={() => void history.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {history.data && <VersionList history={history.data} />}
    </section>
  );
}

function VersionList({ history }: { history: EntityHistory }) {
  if (history.versions.length === 0) {
    return <p className="text-sm text-muted-foreground">No versions yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {history.versions.map((version) => (
        <li
          key={version.id}
          className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-raised px-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-sm text-foreground">
              v{version.versionNumber} · {version.snapshot.name}
            </p>
            <p className="text-xs text-faint-foreground">
              {versionReasonLabel(version.reason)} · {version.branchName} ·{' '}
              {new Date(version.createdAt).toLocaleDateString()}
            </p>
          </div>
          {version.id === history.currentVersionId && (
            <StatusBadge tone="success">Current</StatusBadge>
          )}
        </li>
      ))}
    </ul>
  );
}
