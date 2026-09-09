'use client';

import type { Entity, EntityVersion } from '@level-zero/domain';
import { Button, HistoryIcon, StatusBadge } from '@level-zero/ui';

import { apiErrorMessage } from '@/lib/api';

import {
  useCharacterHistory,
  useCommitCharacterVersion,
  useRestoreCharacterVersion,
} from './use-characters';

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
 * The character's version history — the canonical entity versions, not a
 * second record of who they used to be.
 *
 * Editing does not write a version; committing does. Restoring appends rather
 * than rewinds, so the version you moved away from is still reachable.
 */
export function CharacterHistory({
  projectId,
  character,
}: {
  projectId: string;
  character: Entity;
}) {
  const history = useCharacterHistory(projectId, character.id);
  const commitVersion = useCommitCharacterVersion(projectId);
  const restoreVersion = useRestoreCharacterVersion(projectId);

  if (history.isPending) {
    return <p className="text-sm text-muted-foreground">Loading history…</p>;
  }

  if (history.isError) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-error">{apiErrorMessage(history.error)}</p>
        <Button variant="secondary" size="sm" onClick={() => void history.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const { versions, currentVersionId } = history.data;

  return (
    <div className="flex flex-col gap-3">
      {character.status !== 'archived' && (
        <Button
          variant="secondary"
          size="sm"
          disabled={commitVersion.isPending}
          onClick={() => commitVersion.mutate(character.id)}
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
          No versions yet. Save one when the character settles — until then the entity itself is the
          working copy.
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
                character.status !== 'archived' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={restoreVersion.isPending}
                    onClick={() =>
                      restoreVersion.mutate({ entityId: character.id, versionId: version.id })
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
