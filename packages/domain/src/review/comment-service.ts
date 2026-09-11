import { type Clock } from '../shared/clock';
import { ForbiddenError, NotFoundError, ValidationError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { requireText } from '../shared/validation';
import {
  type Comment,
  type CommentThread,
  MAX_COMMENT_AUTHOR_LENGTH,
  applyCommentEdit,
  createComment,
  groupCommentThreads,
  reopenComment,
  resolveComment,
} from './comment';
import { type CommentRepository } from './comment-repository';
import { type ReviewTargetInput, requireReviewTarget, reviewTargetFilter } from './review-target';
import { type ReviewTargetResolver } from './review-target-resolver';

export interface CommentServiceDeps {
  clock: Clock;
  ids: IdGenerator;
}

export interface NewCommentInput {
  target: ReviewTargetInput;
  author: string;
  body: string;
}

export interface NewReplyInput {
  parentCommentId: string;
  author: string;
  body: string;
}

export interface EditCommentInput {
  /** Free text until authentication lands; then it comes from the session. */
  actor: string;
  body: string;
}

/**
 * Discussion on the things a project is made of.
 *
 * Threads are one level deep and every comment in one shares the target its
 * first comment named, which is what lets a thread be read, resolved and
 * deep-linked as a unit without a second table to own it.
 *
 * Editing and deleting are the author's alone; resolving and reopening are not.
 * Deciding a thread is dealt with is the reviewer's call as much as the
 * writer's, and it is recorded with a name either way.
 */
export class CommentService {
  constructor(
    private readonly comments: CommentRepository,
    private readonly targets: ReviewTargetResolver,
    private readonly deps: CommentServiceDeps,
  ) {}

  /** Starts a thread. The target must exist, in this project. */
  async create(projectId: string, input: NewCommentInput): Promise<Comment> {
    const target = requireReviewTarget('target', input.target);
    await this.targets.requireTarget(projectId, target);

    return this.comments.insert(
      createComment({ projectId, target, author: input.author, body: input.body }, this.deps),
    );
  }

  /**
   * Adds to a thread. The reply inherits its parent's target rather than being
   * told one, so a thread cannot end up spanning two things.
   */
  async reply(projectId: string, input: NewReplyInput): Promise<Comment> {
    const parent = await this.getById(projectId, input.parentCommentId);

    if (parent.parentCommentId !== null) {
      throw new ValidationError('Replies cannot be replied to; a thread is one level deep', {
        field: 'parentCommentId',
        commentId: parent.id,
        parentCommentId: parent.parentCommentId,
      });
    }

    return this.comments.insert(
      createComment(
        {
          projectId,
          target: parent.target,
          parentCommentId: parent.id,
          author: input.author,
          body: input.body,
        },
        this.deps,
      ),
    );
  }

  /** Throws `NotFoundError` rather than returning null: callers want the record. */
  async getById(projectId: string, commentId: string): Promise<Comment> {
    const comment = await this.comments.findById(projectId, commentId);
    if (!comment) throw new NotFoundError('Comment', commentId);
    return comment;
  }

  /** The target's threads, oldest first, each with its replies. */
  async listThreads(projectId: string, target: ReviewTargetInput): Promise<CommentThread[]> {
    const filter = reviewTargetFilter(requireReviewTarget('target', target));
    return groupCommentThreads(await this.comments.listByTarget(projectId, filter));
  }

  async edit(projectId: string, commentId: string, input: EditCommentInput): Promise<Comment> {
    const comment = await this.requireOwn(projectId, commentId, input.actor, 'edit');
    return this.comments.save(applyCommentEdit(comment, input.body, this.deps));
  }

  /** Deletes the comment; deleting the start of a thread takes its replies. */
  async remove(projectId: string, commentId: string, actor: string): Promise<void> {
    const comment = await this.requireOwn(projectId, commentId, actor, 'delete');
    await this.comments.remove(projectId, comment.id);
  }

  async resolve(projectId: string, commentId: string, resolvedBy: string): Promise<Comment> {
    const comment = await this.getById(projectId, commentId);
    return this.comments.save(resolveComment(comment, resolvedBy, this.deps));
  }

  async reopen(projectId: string, commentId: string): Promise<Comment> {
    const comment = await this.getById(projectId, commentId);
    return this.comments.save(reopenComment(comment));
  }

  private async requireOwn(
    projectId: string,
    commentId: string,
    actor: string,
    verb: string,
  ): Promise<Comment> {
    const comment = await this.getById(projectId, commentId);
    const acting = requireText('actor', actor, MAX_COMMENT_AUTHOR_LENGTH);

    if (comment.author !== acting) {
      throw new ForbiddenError(`Only ${comment.author} can ${verb} this comment`, {
        commentId: comment.id,
        actor: acting,
      });
    }
    return comment;
  }
}
