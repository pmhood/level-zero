'use client';

import type { Entity } from '@level-zero/domain';
import { Button, Field, Input, PlusIcon, Textarea } from '@level-zero/ui';
import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/lib/api';

import { useCreateCharacter } from './use-characters';

/**
 * Shown in the inspector when nothing is selected: page-level assistance
 * rather than an empty panel (spec section 56).
 *
 * A name and what they do is enough to get someone onto the board. The
 * visuals, the background and who they answer to all come afterwards, on the
 * character's own tabs.
 */
export function CharacterComposer({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: (character: Entity) => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [motivation, setMotivation] = useState('');
  const createCharacter = useCreateCharacter(projectId);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    createCharacter.mutate(
      {
        name: trimmedName,
        data: { role: role.trim(), motivation: motivation.trim() },
      },
      {
        onSuccess: (character) => {
          setName('');
          setRole('');
          setMotivation('');
          onCreated(character);
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        People drive the story. Name them and say what they do in the world — the rest of the studio
        opens once they exist.
      </p>

      <Field label="Name" htmlFor="new-character-name">
        <Input
          id="new-character-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Kael Voss"
        />
      </Field>

      <Field label="Role" htmlFor="new-character-role" hint="What they do, not who they are to.">
        <Input
          id="new-character-role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          placeholder="Salvager"
        />
      </Field>

      <Field label="Motivation" htmlFor="new-character-motivation">
        <Textarea
          id="new-character-motivation"
          value={motivation}
          onChange={(event) => setMotivation(event.target.value)}
          placeholder="Recover what the flood took, and prove it was worth keeping."
        />
      </Field>

      {createCharacter.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(createCharacter.error, 'Could not create this character.')}
        </p>
      )}

      <Button type="submit" disabled={createCharacter.isPending || name.trim().length === 0}>
        <PlusIcon className="size-4" />
        {createCharacter.isPending ? 'Creating…' : 'Create character'}
      </Button>
    </form>
  );
}
