'use client';

import { Field, Input, Textarea } from '@level-zero/ui';

import { TagInput } from '@/components/tag-input';

import type { CharacterDraft, SetDraft } from './character-profile-form';

/**
 * Who this character is: the fields the rest of the studio reads back — the
 * role on their card, the traits an art prompt would lean on, what they want.
 *
 * Rendered inside the profile form's `fieldset`, which is what disables every
 * control here while a character is archived.
 */
export function OverviewFields({ draft, set }: { draft: CharacterDraft; set: SetDraft }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="character-name">
          <Input
            id="character-name"
            value={draft.name}
            onChange={(event) => set('name', event.target.value)}
          />
        </Field>

        <Field
          label="Role"
          htmlFor="character-role"
          hint="What they do in the world — Salvager, Broker, Navigator."
        >
          <Input
            id="character-role"
            value={draft.role}
            placeholder="Salvager"
            onChange={(event) => set('role', event.target.value)}
          />
        </Field>
      </div>

      <Field label="Quote" htmlFor="character-quote" hint="One line, in their own voice.">
        <Input
          id="character-quote"
          value={draft.quote}
          placeholder="The ocean takes, but it also gives back."
          onChange={(event) => set('quote', event.target.value)}
        />
      </Field>

      <Field label="Summary" htmlFor="character-description">
        <Textarea
          id="character-description"
          value={draft.description}
          placeholder="One or two sentences, for anyone scanning the cast."
          onChange={(event) => set('description', event.target.value)}
        />
      </Field>

      <Field
        label="Key traits"
        hint="Short, castable adjectives. These are what a portrait prompt leans on."
      >
        <TagInput
          tags={draft.traits}
          onChange={(traits) => set('traits', traits)}
          placeholder="Add a trait…"
        />
      </Field>

      <Field
        label="Motivation"
        htmlFor="character-motivation"
        hint="What they are after, and what it would cost them to get it."
      >
        <Textarea
          id="character-motivation"
          value={draft.motivation}
          placeholder="Recover what the flood took, and prove it was worth keeping."
          onChange={(event) => set('motivation', event.target.value)}
        />
      </Field>

      <Field label="Tags">
        <TagInput tags={draft.tags} onChange={(tags) => set('tags', tags)} />
      </Field>
    </>
  );
}
