import {
  type ReviewDecision,
  type ReviewDecisionRepository,
  type ReviewTargetFilter,
  type ReviewTargetType,
} from '@level-zero/domain';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import { reviewDecisions } from '../schema/reviews';
import { toReviewDecision, toReviewDecisionRow } from './mappers';

/**
 * Postgres adapter for the domain's `ReviewDecisionRepository` port.
 *
 * Insert and read only: a decision is an act somebody took, so there is nothing
 * to update and nothing to delete. Reads come back newest first, which is the
 * order `resolveReviewState` relies on to find the decision still in force.
 */
export class DrizzleReviewDecisionRepository implements ReviewDecisionRepository {
  constructor(private readonly db: Database) {}

  async insert(decision: ReviewDecision): Promise<ReviewDecision> {
    const [row] = await this.db
      .insert(reviewDecisions)
      .values(toReviewDecisionRow(decision))
      .returning();

    if (!row) throw new Error('Insert returned no review decision row');
    return toReviewDecision(row);
  }

  async listByTarget(projectId: string, filter: ReviewTargetFilter): Promise<ReviewDecision[]> {
    const rows = await this.db
      .select()
      .from(reviewDecisions)
      .where(
        and(
          eq(reviewDecisions.projectId, projectId),
          eq(reviewDecisions.targetType, filter.targetType),
          eq(reviewDecisions.targetId, filter.targetId),
          // Exactly as `ReviewTargetFilter` promises: a null anchor is the whole
          // target, not "any section" of it.
          filter.anchor === null
            ? isNull(reviewDecisions.targetAnchor)
            : eq(reviewDecisions.targetAnchor, filter.anchor),
        ),
      )
      .orderBy(desc(reviewDecisions.decidedAt), desc(reviewDecisions.id));

    return rows.map(toReviewDecision);
  }

  /** Every section's decisions at once: the anchored rows, newest first. */
  async listAnchoredByTarget(
    projectId: string,
    targetType: ReviewTargetType,
    targetId: string,
  ): Promise<ReviewDecision[]> {
    const rows = await this.db
      .select()
      .from(reviewDecisions)
      .where(
        and(
          eq(reviewDecisions.projectId, projectId),
          eq(reviewDecisions.targetType, targetType),
          eq(reviewDecisions.targetId, targetId),
          isNotNull(reviewDecisions.targetAnchor),
        ),
      )
      .orderBy(desc(reviewDecisions.decidedAt), desc(reviewDecisions.id));

    return rows.map(toReviewDecision);
  }
}
