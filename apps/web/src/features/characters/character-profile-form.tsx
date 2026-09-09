'use client';

import type { Entity } from '@level-zero/domain';
import { Button } from '@level-zero/ui';
import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/lib/api';

import { readCharacter, writeCharacter, type InventoryItem } from './character';
import { InventoryFields } from './character-inventory';
import { OverviewFields } from './character-overview';
import { useUpdateCharacter } from './use-characters';

/** The two tabs that edit structured fields, and so share this one form. */
export type ProfileSection = 'overview' | 'inventory';

export interface CharacterDraft {
  name: string;
  description: string;
  tags: string[];
  role: string;
  quote: string;
  traits: string[];
  motivation: string;
  inventory: InventoryItem[];
}

export type SetDraft = <K extends keyof CharacterDraft>(key: K, value: CharacterDraft[K]) => void;

function draftOf(character: Entity): CharacterDraft {
  const { role, quote, traits, motivation, inventory } = readCharacter(character);

  return {
    name: character.name,
    description: character.description ?? '',
    tags: character.tags,
    role,
    quote,
    traits,
    motivation,
    inventory,
  };
}

/** Blank rows are a side effect of editing in place, never inventory. */
function cleanInventory(items: InventoryItem[]): InventoryItem[] {
  return items
    .map((item) => ({ name: item.name.trim(), note: item.note.trim() }))
    .filter((item) => item.name.length > 0);
}

/**
 * Everything structured about a character: who they are, and what they carry.
 *
 * Overview and Inventory are two views of one edit — a single draft, a single
 * save — so switching between them mid-sentence keeps both sets of changes and
 * saves them together. The prose, the visuals and the graph each autosave or
 * write immediately on their own tabs; nothing here touches them.
 */
export function CharacterProfileForm({
  projectId,
  character,
  section,
}: {
  projectId: string;
  character: Entity;
  section: ProfileSection;
}) {
  const [draft, setDraft] = useState<CharacterDraft>(() => draftOf(character));
  const updateCharacter = useUpdateCharacter(projectId);

  const archived = character.status === 'archived';
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(character));
  const nameIsEmpty = draft.name.trim().length === 0;

  const set: SetDraft = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (archived || !dirty || nameIsEmpty) return;

    updateCharacter.mutate({
      entityId: character.id,
      patch: {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        tags: draft.tags,
        data: writeCharacter(character, {
          role: draft.role.trim(),
          quote: draft.quote.trim(),
          traits: draft.traits,
          motivation: draft.motivation.trim(),
          inventory: cleanInventory(draft.inventory),
        }),
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <fieldset disabled={archived} className="flex flex-col gap-4 disabled:opacity-60">
        {section === 'overview' ? (
          <OverviewFields draft={draft} set={set} />
        ) : (
          <InventoryFields draft={draft} set={set} />
        )}
      </fieldset>

      {updateCharacter.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(updateCharacter.error, 'Could not save this character.')}
        </p>
      )}

      {!archived && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!dirty || nameIsEmpty || updateCharacter.isPending}>
            {updateCharacter.isPending ? 'Saving…' : 'Save changes'}
          </Button>
          {dirty && <p className="text-xs text-faint-foreground">Unsaved changes</p>}
        </div>
      )}
    </form>
  );
}
