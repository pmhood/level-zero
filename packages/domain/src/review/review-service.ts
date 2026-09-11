import { type Clock } from '../shared/clock';
import { type IdGenerator } from '../shared/id';
import {
  type ReviewDecision,
  type ReviewState,
  type ReviewStatus,
  createReviewDecision,
  pinJudgement,
  resolveReviewState,
} from './review-decision';
import { type ReviewDecisionRepository } from './review-decision-repository';
import { type ReviewTargetInput, requireReviewTarget, reviewTargetFilter } from './review-target';
import { type ReviewTargetResolver } from './review-target-resolver';

export interface ReviewServiceDeps {
  clock: Clock;
  ids: IdGenerator;
}

export interface NewReviewDecisionInput {
  target: ReviewTargetInput;
  state: ReviewState;
  /** Free text until authentication lands; then it comes from the session. */
  actor: string;
  note?: string | null;
}

/**
 * Where a piece of work stands, and who said so.
 *
 * Every state change is an append: a target's state is the newest decision that
 * still applies, so approving something never erases the fact that somebody
 * else approved an earlier version of it. Nothing here moves a target on its
 * own — generating content, capturing a prototype version or committing an
 * entity version all leave the review state exactly where the last person put
 * it, which is the point.
 *
 * Transitions are not constrained to a path. `review → approved` is the usual
 * one, but approving straight from `draft`, reopening an approval for another
 * look, or rejecting something already rejected are all things a team does, and
 * each is one honest row saying who did it and when.
 */
export class ReviewService {
  constructor(
    private readonly decisions: ReviewDecisionRepository,
    private readonly targets: ReviewTargetResolver,
    private readonly deps: ReviewServiceDeps,
  ) {}

  /**
   * The target's state now.
   *
   * Answers even when the target has gone — `ReviewStatus.target` is null then —
   * because the history is worth reading either way.
   */
  async getStatus(projectId: string, target: ReviewTargetInput): Promise<ReviewStatus> {
    const requested = requireReviewTarget('target', target);
    const [resolved, decisions] = await Promise.all([
      this.targets.resolve(projectId, requested),
      this.decisions.listByTarget(projectId, reviewTargetFilter(requested)),
    ]);

    return resolveReviewState(decisions, resolved);
  }

  /** Every decision recorded about the target, newest first. */
  async listHistory(projectId: string, target: ReviewTargetInput): Promise<ReviewDecision[]> {
    const filter = reviewTargetFilter(requireReviewTarget('target', target));
    return this.decisions.listByTarget(projectId, filter);
  }

  /**
   * Records one explicit act of review.
   *
   * A judgement lands on the version in front of the reviewer
   * (`pinJudgement`), so it stays attached to what was actually read: the
   * entity can be edited and committed afterwards without inheriting the
   * approval.
   */
  async decide(projectId: string, input: NewReviewDecisionInput): Promise<ReviewDecision> {
    const requested = requireReviewTarget('target', input.target);
    const resolved = await this.targets.requireTarget(projectId, requested);

    return this.decisions.insert(
      createReviewDecision(
        {
          projectId,
          target: pinJudgement(requested, input.state, resolved),
          state: input.state,
          actor: input.actor,
          note: input.note,
        },
        this.deps,
      ),
    );
  }
}
