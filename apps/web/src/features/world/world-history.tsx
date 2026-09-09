'use client';

import type { Entity, EntityVersion } from '@level-zero/domain';
import { Button, HistoryIcon, StatusBadge } from '@level-zero/ui';

import { apiErrorMessage } from '@/lib/api';

import { useCommitWorldVersion, useWorldHistory, useRestoreWorldVersion } from './use-world';

const REASON_LABELS: Record<EntityVersion['reason'], string> = {
  manual: 'Saved',
  milestone: 'Milestone',
  restore: 'Restored',
  branch: 'Branched',
  promotion: 'Promoted',
  ai_edit: 'AI edit',
  playtest: 'Playtest',
  import: 'Imported',
};

/**
 * The entity's version history.
 *
 * Editing does not write a version — committing does — so this is the list of
 * points somebody chose to keep. Restoring appends rather than rewinds, so
 * whatever the setting looked like afterwards is still reachable.
 */
export function WorldHistory({ projectId, entity }: { projectId: string; entity: Entity }) {
  const history = useWorldHistory(projectId, entity.id);
  const commitVersion = useCommitWorldVersion(projectId);
  const restoreVersion = useRestoreWorldVersion(projectId);

  if (history.isPending) {
    return <p className="text-sm text-muted-foreground">Loading history…</p>;
  }

  if (history.isError) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-error">{apiErrorMessage(history.error)}</p>
        <Button variant="secondary" size="sm" onClick={() => history.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const { versions, currentVersionId } = history.data;

  return (
    <div className="flex flex-col gap-4">
      {entity.status !== 'archived' && (
        <Button
          variant="secondary"
          size="sm"
          disabled={commitVersion.isPending}
          onClick={() => commitVersion.mutate(entity.id)}
        >
          <HistoryIcon className="size-4" />
          {commitVersion.isPending ? 'Saving…' : 'Save a version'}
        </Button>
      )}

      {commitVersion.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(commitVersion.error, 'Could not save a version.')}
        </p>
      )}

      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No versions yet. Save one when the canon settles — the entity itself is the working copy
          until then.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {versions.map((version) => (
            <li
              key={version.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-raised px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  v{version.versionNumber} · {version.snapshot.name}
                </p>
                <p className="text-xs text-faint-foreground">
                  {REASON_LABELS[version.reason]} · {version.branchName} ·{' '}
                  {new Date(version.createdAt).toLocaleDateString()}
                </p>
              </div>
              {version.id === currentVersionId ? (
                <StatusBadge tone="success">Current</StatusBadge>
              ) : (
                entity.status !== 'archived' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={restoreVersion.isPending}
                    onClick={() =>
                      restoreVersion.mutate({ entityId: entity.id, versionId: version.id })
                    }
                  >
                    Restore
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      {restoreVersion.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(restoreVersion.error, 'Could not restore that version.')}
        </p>
      )}
    </div>
  );
}
