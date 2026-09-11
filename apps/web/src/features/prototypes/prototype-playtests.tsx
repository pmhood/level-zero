'use client';

import type { Playtest, PrototypeVersion } from '@level-zero/domain';
import { Button, EmptyState, Field, Input, StatusBadge, Textarea } from '@level-zero/ui';
import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/lib/api';

import { playtestStatusBadge } from './prototype-presentation';
import { useCreatePlaytest, usePlaytestsForVersion } from './use-playtests';

/**
 * Playtests tied to the selected prototype version: the record of who ran
 * it and what they found, plus starting a new one.
 *
 * A playtest pins its `prototypeVersionId` at creation and is evidence about
 * that exact version, never the prototype in general
 * (`docs/decisions/playtest-record-model.md`) — switching versions elsewhere
 * in the workspace switches which playtests this shows.
 */
export function PrototypePlaytests({
  projectId,
  version,
}: {
  projectId: string;
  version: PrototypeVersion;
}) {
  const playtestsQuery = usePlaytestsForVersion(projectId, version.id);

  return (
    <div className="flex flex-col gap-5">
      <NewPlaytestForm projectId={projectId} version={version} />

      {playtestsQuery.isPending && (
        <p className="text-sm text-muted-foreground">Loading playtests…</p>
      )}

      {playtestsQuery.isError && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-error">{apiErrorMessage(playtestsQuery.error)}</p>
          <Button variant="secondary" size="sm" onClick={() => void playtestsQuery.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {playtestsQuery.data && <PlaytestList playtests={playtestsQuery.data.items} />}
    </div>
  );
}

function PlaytestList({ playtests }: { playtests: Playtest[] }) {
  if (playtests.length === 0) {
    return (
      <EmptyState
        title="No playtests for this version yet"
        description="Start one above once someone sits down with it — a name is enough to begin."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {playtests.map((playtest) => {
        const badge = playtestStatusBadge(playtest.status);

        return (
          <li
            key={playtest.id}
            className="flex flex-col gap-1.5 rounded-md border border-border-subtle bg-raised px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium text-foreground">{playtest.name}</p>
              <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
            </div>
            {playtest.goal && <p className="text-sm text-muted-foreground">{playtest.goal}</p>}
            <p className="text-xs text-faint-foreground">
              {new Date(playtest.createdAt).toLocaleDateString()}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function NewPlaytestForm({ projectId, version }: { projectId: string; version: PrototypeVersion }) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const createPlaytest = useCreatePlaytest(projectId);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length === 0) return;

    createPlaytest.mutate(
      { prototypeVersionId: version.id, name: name.trim(), goal: goal.trim() || null },
      {
        onSuccess: () => {
          setName('');
          setGoal('');
        },
      },
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-md border border-border-subtle bg-raised p-3"
    >
      <Field label={`Start a playtest of v${version.versionNumber}`} htmlFor="new-playtest-name">
        <Input
          id="new-playtest-name"
          value={name}
          placeholder="Name"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field
        label="Goal"
        htmlFor="new-playtest-goal"
        hint="What this session is meant to find out."
      >
        <Textarea
          id="new-playtest-goal"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
        />
      </Field>
      <div>
        <Button
          type="submit"
          size="sm"
          disabled={name.trim().length === 0 || createPlaytest.isPending}
        >
          {createPlaytest.isPending ? 'Starting…' : 'Start playtest'}
        </Button>
      </div>

      {createPlaytest.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(createPlaytest.error, 'Could not start this playtest.')}
        </p>
      )}
    </form>
  );
}
