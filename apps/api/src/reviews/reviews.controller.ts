import { ReviewService, type ReviewDecision, type ReviewStatus } from '@level-zero/domain';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { RecordReviewDecisionDto, ReviewTargetQueryDto } from './dto/review.dto';

/**
 * Where a piece of work stands, and the record of how it got there.
 *
 * `POST` records one decision; nothing updates or deletes one, so the history
 * this answers with is the whole history. Reading is forgiving where writing is
 * not: a status can be read for a target that has gone (`target` comes back
 * null), while recording a decision about one is a 404.
 */
@Controller('projects/:projectId/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewService) {}

  /** Every decision about the target, newest first. Nothing is ever left out. */
  @Get('history')
  history(
    @Param('projectId') projectId: string,
    @Query() query: ReviewTargetQueryDto,
  ): Promise<ReviewDecision[]> {
    return this.reviews.listHistory(projectId, targetOf(query));
  }

  @Get()
  status(
    @Param('projectId') projectId: string,
    @Query() query: ReviewTargetQueryDto,
  ): Promise<ReviewStatus> {
    return this.reviews.getStatus(projectId, targetOf(query));
  }

  /**
   * Records an explicit act of review. An approval or rejection of an entity
   * lands on the version the reviewer was reading unless one is named.
   */
  @Post()
  decide(
    @Param('projectId') projectId: string,
    @Body() body: RecordReviewDecisionDto,
  ): Promise<ReviewDecision> {
    return this.reviews.decide(projectId, {
      target: {
        type: body.targetType,
        id: body.targetId,
        anchor: body.anchor,
        versionId: body.versionId,
      },
      state: body.state,
      actor: body.actor,
      note: body.note,
    });
  }
}

function targetOf(query: ReviewTargetQueryDto) {
  return { type: query.targetType, id: query.targetId, anchor: query.anchor };
}
