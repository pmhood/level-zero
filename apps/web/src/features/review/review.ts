import type { ReviewState, ReviewTargetType } from '@level-zero/domain';
import type { StatusTone } from '@level-zero/ui';

/**
 * Free text until authentication lands; then it comes from the session — the
 * same placeholder `FindingRow` uses, because this app has no signed-in user
 * yet. It is what makes "edit your own comment" mean anything today.
 */
export const ACTING_AS = 'You';

export interface PresentedState {
  label: string;
  tone: StatusTone;
}

/**
 * The review vocabulary as a badge (spec section 19).
 *
 * `draft` and `review` share `neutral` and `warning` respectively rather than
 * asking for a new tone: the four tones are the whole set, and the label —
 * never the colour alone — is what tells two states apart.
 */
const REVIEW_STATE_BADGES: Record<ReviewState, PresentedState> = {
  draft: { label: 'Draft', tone: 'neutral' },
  review: { label: 'In review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'error' },
};

export function reviewStateBadge(state: ReviewState): PresentedState {
  return REVIEW_STATE_BADGES[state];
}

const TARGET_TYPE_LABELS: Record<ReviewTargetType, string> = {
  entity: 'entity',
  asset: 'file',
  prototype_version: 'prototype version',
};

export function reviewTargetTypeLabel(type: ReviewTargetType): string {
  return TARGET_TYPE_LABELS[type];
}

/**
 * A state a reviewer can put the work into.
 *
 * `draft` is not one: it is where everything starts and what an approval of an
 * earlier version falls back to, never something anyone clicks.
 */
export type ReviewAction = Exclude<ReviewState, 'draft'>;

const REVIEW_ACTIONS: ReviewAction[] = ['review', 'approved', 'rejected'];

/** The actions worth offering from where the work currently stands. */
export function reviewActionsFor(state: ReviewState): ReviewAction[] {
  return REVIEW_ACTIONS.filter((action) => action !== state);
}

const REVIEW_ACTION_LABELS: Record<ReviewAction, string> = {
  review: 'Request review',
  approved: 'Approve',
  rejected: 'Reject',
};

export function reviewActionLabel(action: ReviewAction): string {
  return REVIEW_ACTION_LABELS[action];
}

/** `2026-03-01, 09:00` — short, local, and the same shape the activity feed uses. */
export function formatDecidedAt(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.toLocaleDateString()}, ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}
