'use client';

import type { Entity } from '@level-zero/domain';
import { Button, Field, Input, PlusIcon, Select, Textarea } from '@level-zero/ui';
import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/lib/api';

import {
  MECHANIC_AREAS,
  mechanicAreaLabel,
  type MechanicArea,
  type MechanicEntityType,
} from './mechanic';
import { useCreateMechanic } from './use-mechanics';

/**
 * Shown in the inspector when nothing is selected: page-level assistance
 * rather than an empty panel (spec section 56).
 *
 * A mechanic is one system a player meets; a system groups mechanics — a core
 * loop, an economy. Both are canonical entities and both live in this list.
 */
export function MechanicComposer({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: (mechanic: Entity) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<MechanicEntityType>('mechanic');
  const [area, setArea] = useState<MechanicArea>('core_loop');
  const [fantasy, setFantasy] = useState('');
  const createMechanic = useCreateMechanic(projectId);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    createMechanic.mutate(
      {
        type,
        name: trimmedName,
        data: { area, fantasy: fantasy.trim(), implementationStatus: 'concept' },
      },
      {
        onSuccess: (mechanic) => {
          setName('');
          setFantasy('');
          onCreated(mechanic);
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Name the system and what it is meant to feel like. The rules, inputs and outputs can come
        once it is on the board.
      </p>

      <Field label="Name" htmlFor="new-mechanic-name">
        <Input
          id="new-mechanic-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Oxygen management"
        />
      </Field>

      <Field label="Kind" htmlFor="new-mechanic-type" hint="A system groups other mechanics.">
        <Select
          id="new-mechanic-type"
          value={type}
          onChange={(event) => setType(event.target.value as MechanicEntityType)}
        >
          <option value="mechanic">Mechanic</option>
          <option value="system">System</option>
        </Select>
      </Field>

      <Field label="Area" htmlFor="new-mechanic-area">
        <Select
          id="new-mechanic-area"
          value={area}
          onChange={(event) => setArea(event.target.value as MechanicArea)}
        >
          {MECHANIC_AREAS.map((option) => (
            <option key={option} value={option}>
              {mechanicAreaLabel(option)}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Player fantasy" htmlFor="new-mechanic-fantasy">
        <Textarea
          id="new-mechanic-fantasy"
          value={fantasy}
          onChange={(event) => setFantasy(event.target.value)}
          placeholder="Air is running out and the good salvage is deeper."
        />
      </Field>

      {createMechanic.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(createMechanic.error, 'Could not create this mechanic.')}
        </p>
      )}

      <Button type="submit" disabled={createMechanic.isPending || name.trim().length === 0}>
        <PlusIcon className="size-4" />
        {createMechanic.isPending ? 'Creating…' : 'Create mechanic'}
      </Button>
    </form>
  );
}
