'use client';

import type { Entity } from '@level-zero/domain';
import {
  RichTextEditor,
  SaveStatusLabel,
  useEditorAutosave,
  type JSONContent,
} from '@level-zero/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { entityDocument } from '@/features/entities/entity-document';
import { matchEntities } from '@/features/entities/entity-reference';
import { EntityReferenceProvider } from '@/features/entities/entity-reference-context';
import {
  ENTITY_EMBED_COMMANDS,
  createEntityReferenceExtensions,
} from '@/features/entities/entity-reference-extensions';
import { useReferenceableEntities } from '@/features/entities/use-entities';

import { WORLD_LORE_FIELD } from './world';
import { useSaveWorldLore } from './use-world';

/**
 * The long-form half of a world entity: the history, the rumours, the reasons.
 *
 * The same editor as the GDD, in `notes` mode, so a paragraph moves between
 * the two unchanged — and `@` mentions here point at the same canonical
 * entities, so writing "the Wardens hold it" links the faction rather than
 * restating it.
 */
export function WorldLore({
  projectId,
  entity,
  onOpenReference,
}: {
  projectId: string;
  entity: Entity;
  onOpenReference: (referenced: Entity) => void;
}) {
  const saveLore = useSaveWorldLore(projectId);
  const entitiesQuery = useReferenceableEntities(projectId);
  const entities = entitiesQuery.data?.items ?? [];

  // The `@` menu is built once with the editor but has to search the entities
  // as they are now, so it reads the list through a ref.
  const entitiesRef = useRef(entities);
  useEffect(() => {
    entitiesRef.current = entities;
  });

  const [referenceExtensions] = useState(() =>
    createEntityReferenceExtensions((query) => matchEntities(entitiesRef.current, query)),
  );

  const save = useCallback(
    (lore: JSONContent) => saveLore.mutateAsync({ entity, lore }),
    [saveLore, entity],
  );
  const autosave = useEditorAutosave(save);

  if (entity.status === 'archived') {
    return <p className="text-xs text-faint-foreground">Restore this before editing its lore.</p>;
  }

  return (
    <EntityReferenceProvider
      entities={entities}
      isPending={entitiesQuery.isPending}
      onOpen={onOpenReference}
    >
      <RichTextEditor
        mode="notes"
        label={`Lore for ${entity.name}`}
        placeholder="What happened here, who tells the story, and what do they get wrong?"
        content={entityDocument(entity, WORLD_LORE_FIELD)}
        onChange={autosave.onChange}
        extensions={referenceExtensions}
        commands={ENTITY_EMBED_COMMANDS}
        toolbarActions={<SaveStatusLabel status={autosave.status} error={autosave.error} />}
      />
    </EntityReferenceProvider>
  );
}
