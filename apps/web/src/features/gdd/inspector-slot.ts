import type { Entity } from '@level-zero/domain';

/**
 * What the one inspector slot in `GddDocumentEditor` currently shows. #192
 * (the drafting-panel epic) will add `asset` and `selection` cases as the
 * entity/asset/text-selection routing it describes lands — each is a new
 * member of this union and a new branch in `resolveInspectorSlot`, not a
 * fifth negated guard in the JSX.
 */
export type InspectorSlot =
  | { kind: 'none' }
  | { kind: 'entity'; entity: Entity }
  | { kind: 'review' }
  | { kind: 'ai' }
  | { kind: 'history' };

/**
 * The single place that decides which of the four panels — the entity
 * reference, Review, the AI inspector or History — the slot shows, in place
 * of the four negated-guard JSX conditions that used to encode both the
 * choice and its precedence at once.
 *
 * Precedence, highest first: the entity reference, then Review, then Ask AI,
 * then History — the same order the replaced guards read in. `comparing`
 * suppresses every panel (the slot has nothing to show beside the version
 * compare view). `archived` suppresses only Ask AI's content, but — matching
 * the original guards exactly — an open Ask AI still claims the slot rather
 * than falling through to History once archived hides it; the panels'
 * toggle handlers keep `askingAi` and `historyOpen` from both being true, so
 * this case is unreachable in practice, but the resolver preserves it
 * faithfully rather than assuming the invariant.
 */
export function resolveInspectorSlot({
  openEntity,
  reviewOpen,
  askingAi,
  historyOpen,
  comparing,
  archived,
}: {
  openEntity: Entity | null;
  reviewOpen: boolean;
  askingAi: boolean;
  historyOpen: boolean;
  comparing: boolean;
  archived: boolean;
}): InspectorSlot {
  if (comparing) return { kind: 'none' };
  if (openEntity) return { kind: 'entity', entity: openEntity };
  if (reviewOpen) return { kind: 'review' };
  if (askingAi) return archived ? { kind: 'none' } : { kind: 'ai' };
  if (historyOpen) return { kind: 'history' };
  return { kind: 'none' };
}
