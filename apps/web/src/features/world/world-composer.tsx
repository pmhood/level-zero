'use client';

import type { Entity } from '@level-zero/domain';
import { Button, Field, Input, PlusIcon, Select, Textarea } from '@level-zero/ui';
import { useState, type FormEvent } from 'react';

import { entityTypeLabel } from '@/features/entities/entity-presentation';
import { apiErrorMessage } from '@/lib/api';

import { WORLD_ENTITY_TYPES, type WorldEntityType } from './world';
import { useCreateWorldEntity } from './use-world';

/**
 * Shown in the inspector when nothing is selected: page-level assistance
 * rather than an empty panel (spec section 56).
 *
 * Every kind of world object is created the same way, because every kind is
 * the same canonical entity — the type only decides where it shows up on the
 * dashboard and what it is reasonable to link it to.
 */
export function WorldComposer({
  projectId,
  type,
  onCreated,
}: {
  projectId: string;
  /** Pre-selected kind, so "Add a faction" on the dashboard opens ready to go. */
  type: WorldEntityType;
  onCreated: (entity: Entity) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<WorldEntityType>(type);
  const [era, setEra] = useState('');
  const [description, setDescription] = useState('');
  const createEntity = useCreateWorldEntity(projectId);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    createEntity.mutate(
      {
        type: kind,
        name: trimmedName,
        description: description.trim() || null,
        data: { era: era.trim(), canonStatus: 'proposed', risk: 'none' },
      },
      {
        onSuccess: (entity) => {
          setName('');
          setEra('');
          setDescription('');
          onCreated(entity);
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Name it and say what kind of thing it is. Everything it holds, controls or appears in can
        come once it exists.
      </p>

      <Field label="Kind" htmlFor="new-world-type">
        <Select
          id="new-world-type"
          value={kind}
          onChange={(event) => setKind(event.target.value as WorldEntityType)}
        >
          {WORLD_ENTITY_TYPES.map((option) => (
            <option key={option} value={option}>
              {entityTypeLabel(option)}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Name" htmlFor="new-world-name">
        <Input
          id="new-world-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="The Shattered Belt"
        />
      </Field>

      <Field
        label="Era"
        htmlFor="new-world-era"
        hint="When this sits in the setting's history. Orders the timeline."
      >
        <Input
          id="new-world-era"
          value={era}
          onChange={(event) => setEra(event.target.value)}
          placeholder="c. 2226"
        />
      </Field>

      <Field label="Summary" htmlFor="new-world-description">
        <Textarea
          id="new-world-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="One or two sentences, for anyone scanning the world."
        />
      </Field>

      {createEntity.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(createEntity.error, 'Could not create this.')}
        </p>
      )}

      <Button type="submit" disabled={createEntity.isPending || name.trim().length === 0}>
        <PlusIcon className="size-4" />
        {createEntity.isPending ? 'Creating…' : `Create ${entityTypeLabel(kind).toLowerCase()}`}
      </Button>
    </form>
  );
}
