import type { AssetMarkKind, AssetSelection, AssetSelectionState } from '@level-zero/domain';

import type { PresentedState } from '@/features/review/review';

/**
 * A purpose an asset can be approved for, and how it reads on screen.
 *
 * The domain stores a purpose as a plain label and never parses it, so the
 * vocabulary lives here, beside the surfaces that offer it — Character Studio
 * knows what a character's visuals are for, and the domain does not need to.
 */
export interface AssetPurpose {
  value: string;
  label: string;
}

/**
 * The character visuals worth choosing between (design system spec §31 names
 * the generative actions these come out of).
 *
 * `portrait` is the one everything else is measured against, so it is first.
 */
export const CHARACTER_VISUAL_PURPOSES: readonly AssetPurpose[] = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'costume', label: 'Costume exploration' },
  { value: 'expression', label: 'Expression sheet' },
  { value: 'pose', label: 'Pose sheet' },
  { value: 'concept', label: 'Concept art' },
];

/** What a location, faction or region's visuals are for (UX spec, World). */
export const WORLD_VISUAL_PURPOSES: readonly AssetPurpose[] = [
  { value: 'key_visual', label: 'Key visual' },
  { value: 'concept', label: 'Concept art' },
  { value: 'map', label: 'Map' },
];

/**
 * A board's own purpose: the direction it is arguing for.
 *
 * A moodboard board is an entity, so approving a tile on it is an ordinary
 * context-scoped approval — no second mechanism.
 */
export const MOODBOARD_PURPOSE: AssetPurpose = { value: 'direction', label: 'Visual direction' };

const PURPOSE_LABELS = new Map(
  [...CHARACTER_VISUAL_PURPOSES, ...WORLD_VISUAL_PURPOSES, MOODBOARD_PURPOSE].map((purpose) => [
    purpose.value,
    purpose.label,
  ]),
);

/** Falls back to the stored value, so a purpose from elsewhere still reads. */
export function purposeLabel(purpose: string): string {
  return PURPOSE_LABELS.get(purpose) ?? purpose;
}

/**
 * The selection vocabulary as a badge (spec §19).
 *
 * `superseded` is `neutral` rather than `error`: it was the right choice once,
 * and the label is what says it is no longer the current one.
 */
const SELECTION_STATE_BADGES: Record<AssetSelectionState, PresentedState> = {
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'error' },
  superseded: { label: 'Superseded', tone: 'neutral' },
};

export function assetSelectionBadge(state: AssetSelectionState): PresentedState {
  return SELECTION_STATE_BADGES[state];
}

const MARK_LABELS: Record<AssetMarkKind, string> = {
  favorite: 'Favourite',
  shortlisted: 'Shortlisted',
};

export function assetMarkLabel(kind: AssetMarkKind): string {
  return MARK_LABELS[kind];
}

/** The decision in force for one asset in the context `history` came from. */
export function selectionFor(
  history: readonly AssetSelection[],
  assetId: string,
): AssetSelection | null {
  return history.find((selection) => selection.assetId === assetId) ?? null;
}
