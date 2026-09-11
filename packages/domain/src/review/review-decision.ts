import { type Clock } from '../shared/clock';
import { type IdGenerator } from '../shared/id';
import { optionalText, requireOneOf, requireText } from '../shared/validation';
import {
  type ResolvedReviewTarget,
  type ReviewTarget,
  type ReviewTargetInput,
  requireReviewTarget,
} from './review-target';

/**
 * How far a reviewable target has been taken, deliberately.
 *
 * This is a *review* vocabulary and not a lifecycle one: `ENTITY_STATUSES`,
 * `ASSET_STATUSES` and `PROTOTYPE_VERSION_STATUSES` say whether a record is
 * being worked on, playable or archived, which is orthogonal to whether anyone
 * has read it and agreed to it. Extending one of those would have forced all
 * three to grow the same four values, made `archived` and `approved` compete
 * for one column, and left approval with nowhere to record who decided, when,
 * or against which version.
 *
 * `draft` is where everything starts and is never written to storage — it is
 * what no decision at all reads as. The other three are only ever reached by a
 * person recording a decision.
 */
export const REVIEW_STATES = ['draft', 'review', 'approved', 'rejected'] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const MAX_REVIEW_ACTOR_LENGTH = 200;
export const MAX_REVIEW_NOTE_LENGTH = 2000;

/**
 * One explicit act of review, kept forever.
 *
 * Rows are only ever inserted, like `Activity` and `EntityVersion`: a target's
 * state is the newest decision that still applies rather than a column anything
 * overwrites, so who approved what is always answerable. `actor` is required —
 * an approval nobody is named for is not an approval — which is why this is not
 * modelled on `Generation`, whose states a worker moves without a person.
 */
export interface ReviewDecision {
  id: string;
  projectId: string;
  target: ReviewTarget;
  state: ReviewState;
  /** Free text until authentication lands; then a user id. */
  actor: string;
  /** Why, in the reviewer's words. Optional, and shown verbatim. */
  note: string | null;
  decidedAt: Date;
}

export interface RecordReviewDecisionInput {
  projectId: string;
  target: ReviewTargetInput;
  state: ReviewState;
  actor: string;
  note?: string | null;
}

export interface ReviewDecisionFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createReviewDecision(
  input: RecordReviewDecisionInput,
  deps: ReviewDecisionFactoryDeps,
): ReviewDecision {
  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    target: requireReviewTarget('target', input.target),
    state: requireOneOf('state', input.state, REVIEW_STATES),
    actor: requireText('actor', input.actor, MAX_REVIEW_ACTOR_LENGTH),
    note: optionalText('note', input.note, MAX_REVIEW_NOTE_LENGTH),
    decidedAt: deps.clock.now(),
  };
}

/**
 * Whether a state judges the target rather than moving it along.
 *
 * A judgement is about something specific a reviewer read, so it is pinned to
 * the version in front of them (`pinJudgement`); `draft` and `review` describe
 * where the work is and follow the target as it changes.
 */
export function isReviewJudgement(state: ReviewState): boolean {
  return state === 'approved' || state === 'rejected';
}

/**
 * Pins a judgement to the version the reviewer was looking at.
 *
 * This is what stops an old approval from vouching for work done afterwards:
 * the row names a version, and the version it names is over as soon as the
 * entity moves on. A caller may pin an older version deliberately — approving
 * v1 retrospectively — and anything without versions is left unpinned, because
 * there is nothing for the judgement to go out of date against.
 */
export function pinJudgement(
  target: ReviewTarget,
  state: ReviewState,
  resolved: ResolvedReviewTarget,
): ReviewTarget {
  if (!isReviewJudgement(state)) return target;
  if (target.versionId !== null || resolved.currentVersionId === null) return target;
  return { ...target, versionId: resolved.currentVersionId };
}

/**
 * A target's review state, and the decisions that explain it.
 *
 * `target` is null when the thing reviewed no longer resolves — a hard-deleted
 * row, or an id that never named anything. The state is still reported, so a
 * history stays readable instead of erroring.
 */
export interface ReviewStatus {
  target: ResolvedReviewTarget | null;
  state: ReviewState;
  /** The decision that set `state`; null when nothing has been recorded. */
  decision: ReviewDecision | null;
  /**
   * A judgement pinned to a version that is no longer the one in force — an
   * approval that does not carry. This is the "Stale" the UX spec's section
   * status describes: something was agreed, and then the work moved on.
   */
  staleDecision: ReviewDecision | null;
}

/**
 * Reads a target's decisions, newest first, and reports where it stands.
 *
 * The newest decision is the state — nothing an older one said outranks it,
 * which is the whole reason these rows are only ever appended. The single
 * exception is a decision that named a version no longer in force: it was about
 * something specific that has since been replaced, so it does not carry, and the
 * target reads as `draft` again with that decision reported as `staleDecision`.
 *
 * Earlier decisions are deliberately not fallen back on. An older approval
 * applying again once a newer one goes stale would be an approval nobody gave to
 * the version in front of them.
 */
export function resolveReviewState(
  decisions: readonly ReviewDecision[],
  target: ResolvedReviewTarget | null,
): ReviewStatus {
  const newest = decisions[0] ?? null;
  if (!newest) return { target, state: 'draft', decision: null, staleDecision: null };

  const pinnedVersionId = newest.target.versionId;
  const applies =
    pinnedVersionId === null || pinnedVersionId === (target?.currentVersionId ?? null);

  return applies
    ? { target, state: newest.state, decision: newest, staleDecision: null }
    : { target, state: 'draft', decision: null, staleDecision: newest };
}
