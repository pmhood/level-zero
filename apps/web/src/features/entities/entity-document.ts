import type { Entity } from '@level-zero/domain';
import type { JSONContent } from '@level-zero/ui';

/**
 * Reads a rich-text document out of an entity's type-specific `data`.
 *
 * Documents are stored as TipTap JSON — never rendered HTML — under a named
 * field, so one entity can carry more than one (a GDD body, a notes panel).
 * Anything that is not a TipTap document reads as "nothing written yet" rather
 * than reaching the editor and failing there.
 */
export function entityDocument(entity: Entity, field: string): JSONContent | null {
  const stored = entity.data[field];
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return null;

  const content = stored as JSONContent;
  return content.type === 'doc' ? content : null;
}
