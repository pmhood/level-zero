'use client';

import type { Entity } from '@level-zero/domain';
import {
  RichTextEditor,
  SaveStatusLabel,
  useEditorAutosave,
  type JSONContent,
} from '@level-zero/ui';
import { useCallback } from 'react';

import { entityDocument } from '@/features/entities/entity-document';

import { MECHANIC_RATIONALE_FIELD } from './mechanic';
import { useSaveMechanicRationale } from './use-mechanics';

/**
 * Why this mechanic is shaped the way it is: what it is for, what was tried,
 * what is still open.
 *
 * The same editor as the GDD, so a paragraph moves between the two unchanged.
 * The structured fields next door stay values; this is the argument for them.
 */
export function MechanicRationale({
  projectId,
  mechanic,
}: {
  projectId: string;
  mechanic: Entity;
}) {
  const saveRationale = useSaveMechanicRationale(projectId);

  const save = useCallback(
    (rationale: JSONContent) => saveRationale.mutateAsync({ mechanic, rationale }),
    [saveRationale, mechanic],
  );
  const autosave = useEditorAutosave(save);

  if (mechanic.status === 'archived') {
    return (
      <p className="text-xs text-faint-foreground">Restore this mechanic before editing it.</p>
    );
  }

  return (
    <RichTextEditor
      mode="notes"
      label={`Rationale for ${mechanic.name}`}
      placeholder="What is this system really for? What did you rule out, and why?"
      content={entityDocument(mechanic, MECHANIC_RATIONALE_FIELD)}
      onChange={autosave.onChange}
      toolbarActions={<SaveStatusLabel status={autosave.status} error={autosave.error} />}
    />
  );
}
