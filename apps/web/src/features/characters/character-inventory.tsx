'use client';

import { Button, CloseIcon, Field, Input, PlusIcon } from '@level-zero/ui';

import type { InventoryItem } from './character';
import type { CharacterDraft, SetDraft } from './character-profile-form';

const EMPTY_ITEM: InventoryItem = { name: '', note: '' };

/**
 * What the character carries: a name and why it matters to them.
 *
 * Kit is a detail of the person, so it lives in the character's own `data`.
 * Anything that becomes canon in its own right — a weapon with a mechanic
 * behind it, a keepsake tied to a location — is already an entity, and is
 * linked on the Relationships tab instead of retyped here.
 *
 * Rendered inside the profile form's `fieldset`, which is what disables every
 * control here while a character is archived.
 */
export function InventoryFields({ draft, set }: { draft: CharacterDraft; set: SetDraft }) {
  const { inventory } = draft;

  function replace(index: number, patch: Partial<InventoryItem>) {
    set(
      'inventory',
      inventory.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  return (
    <Field
      label="Inventory"
      hint="What they carry, and what it means to them. Empty rows are dropped on save."
    >
      {inventory.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {inventory.map((item, index) => (
            <li key={index} className="flex items-center gap-1.5">
              <Input
                aria-label={`Item ${index + 1} name`}
                value={item.name}
                placeholder="Cutting torch"
                className="w-2/5"
                onChange={(event) => replace(index, { name: event.target.value })}
              />
              <Input
                aria-label={`Item ${index + 1} note`}
                value={item.note}
                placeholder="Her father's. Runs hot."
                onChange={(event) => replace(index, { note: event.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove item ${index + 1}`}
                onClick={() =>
                  set(
                    'inventory',
                    inventory.filter((_, i) => i !== index),
                  )
                }
              >
                <CloseIcon className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => set('inventory', [...inventory, EMPTY_ITEM])}
        >
          <PlusIcon className="size-4" />
          Add item
        </Button>
      </div>
    </Field>
  );
}
