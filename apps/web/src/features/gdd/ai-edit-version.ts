import { isSignificantAiEdit, type SnapshotDocumentInput } from '@level-zero/domain';
import type { AcceptedAiEdit, JSONContent } from '@level-zero/ui';

/**
 * Puts an accepted AI edit into the document's history — when it is big enough
 * to want back.
 *
 * The text itself is already safe: accepting is an ordinary editor
 * transaction, so autosave persists it like any other typing. What is decided
 * here is the *version*, and two things about it matter. A tweak does not get
 * one, or a writer working through a section with the AI would end up with a
 * history list nobody can read. And the body is saved before the snapshot is
 * taken, because a version records what the server holds, not what is on
 * screen.
 */
export async function recordAcceptedAiEdit(
  edit: AcceptedAiEdit,
  save: (content: JSONContent) => Promise<unknown>,
  snapshot: (input: SnapshotDocumentInput) => Promise<unknown>,
): Promise<void> {
  if (!isSignificantAiEdit(edit.replaced, edit.accepted)) return;

  await save(edit.content);
  await snapshot({
    reason: 'ai_edit',
    name: `AI edit — ${edit.label}`,
    generationId: edit.generationId,
  });
}
