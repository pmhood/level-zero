import { type Comment } from './comment';
import { type ReviewTargetFilter } from './review-target';

/**
 * Storage port for comments.
 *
 * Every method is scoped by `projectId`, so a comment from another project
 * reads as missing rather than forbidden. There is no listing that spans
 * targets: a thread is read where its target is shown.
 */
export interface CommentRepository {
  insert(comment: Comment): Promise<Comment>;
  findById(projectId: string, commentId: string): Promise<Comment | null>;
  /** Every comment on the target, replies included, oldest first. */
  listByTarget(projectId: string, filter: ReviewTargetFilter): Promise<Comment[]>;
  save(comment: Comment): Promise<Comment>;
  /** Removes the comment and, when it starts a thread, the replies under it. */
  remove(projectId: string, commentId: string): Promise<void>;
}
