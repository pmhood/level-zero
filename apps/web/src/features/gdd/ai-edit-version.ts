import { isSignificantAiEdit, type SnapshotDocumentInput } from '@level-zero/domain';
import type { AcceptedAiEdit } from '@level-zero/ui';

/**
 * Puts an accepted AI edit into the document's history — when it is big enough
 * to want back.
 *
 * The text itself is already safe: accepting is an ordinary editor
 * transaction, so autosave has the new body like any other typing. What is
 * decided here is the *version*, and two things about it matter.
 *
 * A tweak does not get one, or a writer working through a section with the AI
 * would end up with a history list nobody can read.
 *
 * And the body is brought up to date by flushing autosave rather than by
 * saving alongside it, because a snapshot records what the server holds. A
 * second writer here would be free to land after the keystrokes typed since
 * accepting and overwrite them; the flush queues behind autosave instead, so
 * the version is of a document that still has everything in it.
 */
export async function recordAcceptedAiEdit(
  edit: AcceptedAiEdit,
  flush: () => Promise<void>,
  snapshot: (input: SnapshotDocumentInput) => Promise<unknown>,
): Promise<void> {
  if (!isSignificantAiEdit(edit.replaced, edit.accepted)) return;

  await flush();
  await snapshot({
    reason: 'ai_edit',
    name: `AI edit — ${edit.label}`,
    generationId: edit.generationId,
  });
}
