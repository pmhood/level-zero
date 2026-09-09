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

import { IDEA_NOTES_FIELD, useSaveIdeaNotes } from './use-ideas';

/**
 * Working notes on one idea: what it is really about, what would have to be
 * true, what to try next.
 *
 * The same editor as the GDD in its compact mode — the inspector is 320px
 * wide, so it shows a short toolbar and no block menu, but the content is the
 * same TipTap JSON and moves between the two surfaces unchanged.
 */
export function IdeaNotes({ projectId, idea }: { projectId: string; idea: Entity }) {
  const saveNotes = useSaveIdeaNotes(projectId);

  const save = useCallback(
    (notes: JSONContent) => saveNotes.mutateAsync({ idea, notes }),
    [saveNotes, idea],
  );
  const autosave = useEditorAutosave(save);

  if (idea.status === 'archived') {
    return <p className="text-xs text-faint-foreground">Restore this idea before editing it.</p>;
  }

  return (
    <RichTextEditor
      mode="compact"
      label={`Notes on ${idea.name}`}
      placeholder="What is this really about? What would have to be true?"
      content={entityDocument(idea, IDEA_NOTES_FIELD)}
      onChange={autosave.onChange}
      toolbarActions={<SaveStatusLabel status={autosave.status} error={autosave.error} />}
    />
  );
}
