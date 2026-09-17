import { CommentService, type Comment, type CommentThread } from '@level-zero/domain';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';

import {
  ActorDto,
  CreateCommentDto,
  CreateReplyDto,
  ReviewTargetQueryDto,
  TargetAddressDto,
  UpdateCommentDto,
} from './dto/review.dto';

/**
 * Discussion on entities, assets, prototype versions and document sections.
 *
 * The route is project-scoped and the target is a parameter rather than a path
 * segment, because a comment is one concept whatever it is about — there is no
 * `/entities/:id/comments` and no `/assets/:id/comments` to keep in step.
 *
 * `author` and `actor` arrive in the request: free text until authentication
 * lands, then the session's user. Editing and deleting check the actor against
 * the comment's author and answer 403 when they differ, while another project's
 * comment is 404 whoever asks.
 */
@Controller('projects/:projectId/comments')
export class CommentsController {
  constructor(private readonly comments: CommentService) {}

  /** The target's threads, oldest first, each with its replies. */
  @Get()
  list(
    @Param('projectId') projectId: string,
    @Query() query: ReviewTargetQueryDto,
  ): Promise<CommentThread[]> {
    return this.comments.listThreads(projectId, {
      type: query.targetType,
      id: query.targetId,
      anchor: query.anchor,
    });
  }

  /**
   * Every thread anchored inside the target, whichever section — what a
   * document's review inspector reads, because a thread whose section has been
   * deleted is one it cannot name to ask for.
   */
  @Get('anchored')
  listAnchored(
    @Param('projectId') projectId: string,
    @Query() query: TargetAddressDto,
  ): Promise<CommentThread[]> {
    return this.comments.listAnchoredThreads(projectId, {
      type: query.targetType,
      id: query.targetId,
    });
  }

  @Post()
  create(@Param('projectId') projectId: string, @Body() body: CreateCommentDto): Promise<Comment> {
    return this.comments.create(projectId, {
      target: {
        type: body.targetType,
        id: body.targetId,
        anchor: body.anchor,
        versionId: body.versionId,
      },
      author: body.author,
      body: body.body,
    });
  }

  /** Adds to a thread. The reply takes the target its thread was opened on. */
  @Post(':commentId/replies')
  reply(
    @Param('projectId') projectId: string,
    @Param('commentId') commentId: string,
    @Body() body: CreateReplyDto,
  ): Promise<Comment> {
    return this.comments.reply(projectId, {
      parentCommentId: commentId,
      author: body.author,
      body: body.body,
    });
  }

  @Post(':commentId/resolve')
  resolve(
    @Param('projectId') projectId: string,
    @Param('commentId') commentId: string,
    @Body() body: ActorDto,
  ): Promise<Comment> {
    return this.comments.resolve(projectId, commentId, body.actor);
  }

  @Post(':commentId/reopen')
  reopen(
    @Param('projectId') projectId: string,
    @Param('commentId') commentId: string,
  ): Promise<Comment> {
    return this.comments.reopen(projectId, commentId);
  }

  /** The author's own text, rewritten. The target and the author never change. */
  @Patch(':commentId')
  update(
    @Param('projectId') projectId: string,
    @Param('commentId') commentId: string,
    @Body() body: UpdateCommentDto,
  ): Promise<Comment> {
    return this.comments.edit(projectId, commentId, { actor: body.actor, body: body.body });
  }

  /** Deleting the comment that starts a thread deletes the replies under it. */
  @Delete(':commentId')
  @HttpCode(204)
  async remove(
    @Param('projectId') projectId: string,
    @Param('commentId') commentId: string,
    @Query() query: ActorDto,
  ): Promise<void> {
    await this.comments.remove(projectId, commentId, query.actor);
  }
}
