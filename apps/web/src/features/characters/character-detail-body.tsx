'use client';

import type { Entity } from '@level-zero/domain';
import { Tabs } from '@level-zero/ui';
import { useState } from 'react';

import { EntityVersionCompare } from '@/features/entities/entity-version-compare';

import { CHARACTER_BACKGROUND_FIELD, CHARACTER_NOTES_FIELD } from './character';
import { CharacterProfileForm, type ProfileSection } from './character-profile-form';
import { CharacterProse } from './character-prose';
import { CharacterRelationships } from './character-relationships';
import { CharacterVisuals } from './character-visuals';

type DetailTab = ProfileSection | 'visuals' | 'background' | 'relationships' | 'notes' | 'compare';

const TABS: { value: DetailTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'visuals', label: 'Visuals' },
  { value: 'background', label: 'Background' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'relationships', label: 'Relationships' },
  { value: 'notes', label: 'Notes' },
  { value: 'compare', label: 'Compare' },
];

function isProfileSection(tab: DetailTab): tab is ProfileSection {
  return tab === 'overview' || tab === 'inventory';
}

/**
 * The tabs and panels beneath a character's header — the six sections the spec
 * gives them (section 31) — who they are, what they look like, where they came
 * from, what they carry, who they are bound to, and what is still open.
 *
 * Nothing here is a second store. The structured sections write the entity's
 * `data`, the written ones write TipTap JSON into the same place, visuals are
 * edges to reusable assets, and relationships are the graph itself.
 */
export function CharacterDetailBody({
  projectId,
  character,
}: {
  projectId: string;
  character: Entity;
}) {
  const [tab, setTab] = useState<DetailTab>('overview');

  const archived = character.status === 'archived';

  return (
    <>
      <div className="px-5 pt-3">
        <Tabs value={tab} onChange={(value) => setTab(value as DetailTab)} items={TABS} />
      </div>

      {archived && (
        <p className="px-5 pt-3 text-xs text-faint-foreground">
          Restore this character before editing it. Its visuals, relationships and history are
          intact.
        </p>
      )}

      <div className="px-5 py-4">
        {isProfileSection(tab) && (
          <CharacterProfileForm projectId={projectId} character={character} section={tab} />
        )}

        {tab === 'visuals' && <CharacterVisuals projectId={projectId} character={character} />}

        {tab === 'background' && (
          <CharacterProse
            projectId={projectId}
            character={character}
            field={CHARACTER_BACKGROUND_FIELD}
            label="Background"
            mode="document"
            placeholder="Where they came from, who they were before, and what it cost them."
          />
        )}

        {tab === 'relationships' && (
          <CharacterRelationships projectId={projectId} character={character} />
        )}

        {tab === 'compare' && <EntityVersionCompare projectId={projectId} entity={character} />}

        {tab === 'notes' && (
          <CharacterProse
            projectId={projectId}
            character={character}
            field={CHARACTER_NOTES_FIELD}
            label="Notes"
            mode="notes"
            placeholder="Casting thoughts, open questions, things to come back to…"
          />
        )}
      </div>
    </>
  );
}
