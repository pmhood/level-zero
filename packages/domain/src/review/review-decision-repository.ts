import { type ReviewDecision } from './review-decision';
import { type ReviewTargetFilter } from './review-target';

/**
 * Storage port for review decisions.
 *
 * There is deliberately no update or delete: a decision is an act someone took
 * at a moment, the same as an `Activity` or an `EntityVersion`. A target's
 * current state is read from the history rather than kept beside it, so
 * nothing can overwrite who approved what.
 */
export interface ReviewDecisionRepository {
  insert(decision: ReviewDecision): Promise<ReviewDecision>;
  /** The target's decisions, newest first. */
  listByTarget(projectId: string, filter: ReviewTargetFilter): Promise<ReviewDecision[]>;
}
