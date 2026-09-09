'use client';

import type { Entity } from '@level-zero/domain';
import {
  RichTextEditor,
  SaveStatusLabel,
  useEditorAutosave,
  type EditorMode,
  type JSONContent,
} from '@level-zero/ui';
import { useCallback } from 'react';

import { entityDocument } from '@/features/entities/entity-document';

import { useSaveCharacterDocument } from './use-characters';

export interface CharacterProseProps {
  projectId: string;
  character: Entity;
  /** Which document in the character's `data` this surface edits. */
  field: string;
  /** Names the writing area, e.g. "Background". */
  label: string;
  mode: EditorMode;
  placeholder: string;
}

/**
 * One of the character's two written surfaces: the background that is canon,
 * and the notes that are not yet.
 *
 * The same editor as the GDD, so a paragraph moves between the two unchanged,
 * and the same TipTap JSON in the entity's `data` — never rendered HTML.
 */
export function CharacterProse({
  projectId,
  character,
  field,
  label,
  mode,
  placeholder,
}: CharacterProseProps) {
  const saveDocument = useSaveCharacterDocument(projectId, field);

  const save = useCallback(
    (content: JSONContent) => saveDocument.mutateAsync({ character, content }),
    [saveDocument, character],
  );
  const autosave = useEditorAutosave(save);

  if (character.status === 'archived') {
    return (
      <p className="text-xs text-faint-foreground">Restore this character before editing it.</p>
    );
  }

  return (
    <RichTextEditor
      mode={mode}
      label={`${label} for ${character.name}`}
      placeholder={placeholder}
      content={entityDocument(character, field)}
      onChange={autosave.onChange}
      toolbarActions={<SaveStatusLabel status={autosave.status} error={autosave.error} />}
    />
  );
}
