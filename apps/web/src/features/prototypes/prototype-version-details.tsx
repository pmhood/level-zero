'use client';

import {
  PROTOTYPE_VERSION_STATUSES,
  type PrototypeVersion,
  type PrototypeVersionStatus,
} from '@level-zero/domain';
import { Button, Field, Select, StatusBadge, Textarea } from '@level-zero/ui';
import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/lib/api';

import { prototypeVersionStatusBadge } from './prototype-presentation';
import { useAnnotatePrototypeVersion } from './use-prototypes';

interface Draft {
  status: PrototypeVersionStatus;
  notes: string;
}

function draftOf(version: PrototypeVersion): Draft {
  return { status: version.status, notes: version.notes ?? '' };
}

/**
 * Status and notes — the two annotations a prototype version can carry after
 * capture (`AnnotatePrototypeVersionInput`; the pinned members never change).
 *
 * Keyed by `version.id` from the caller, so switching versions resets this
 * form's draft to the newly selected version's own values instead of
 * carrying over an edit in progress on the wrong version.
 */
export function PrototypeVersionDetails({
  projectId,
  prototypeId,
  version,
}: {
  projectId: string;
  prototypeId: string;
  version: PrototypeVersion;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(version));
  const annotate = useAnnotatePrototypeVersion(projectId, prototypeId);

  const dirty = draft.status !== version.status || draft.notes.trim() !== (version.notes ?? '');
  const badge = prototypeVersionStatusBadge(version.status);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;

    annotate.mutate({
      versionId: version.id,
      patch: { status: draft.status, notes: draft.notes.trim() || null },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Captured {new Date(version.createdAt).toLocaleDateString()}
          {version.createdBy ? ` by ${version.createdBy}` : ''}
        </p>
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      </div>

      <Field label="Status" htmlFor="prototype-version-status">
        <Select
          id="prototype-version-status"
          value={draft.status}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              status: event.target.value as PrototypeVersionStatus,
            }))
          }
        >
          {PROTOTYPE_VERSION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {prototypeVersionStatusBadge(status).label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Notes" htmlFor="prototype-version-notes">
        <Textarea
          id="prototype-version-notes"
          value={draft.notes}
          placeholder="What this version is for, what to look at, what changed."
          onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
        />
      </Field>

      <Button type="submit" variant="secondary" size="sm" disabled={!dirty || annotate.isPending}>
        {annotate.isPending ? 'Saving…' : 'Save'}
      </Button>

      {annotate.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(annotate.error, 'Could not save this version.')}
        </p>
      )}
    </form>
  );
}
