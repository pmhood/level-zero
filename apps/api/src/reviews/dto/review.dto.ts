import {
  MAX_COMMENT_AUTHOR_LENGTH,
  MAX_COMMENT_BODY_LENGTH,
  MAX_REVIEW_ACTOR_LENGTH,
  MAX_REVIEW_NOTE_LENGTH,
  MAX_REVIEW_TARGET_ANCHOR_LENGTH,
  REVIEW_STATES,
  REVIEW_TARGET_TYPES,
  type ReviewState,
  type ReviewTargetType,
} from '@level-zero/domain';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The thing being commented on or reviewed.
 *
 * `targetType` and `targetId` are the address; `anchor` narrows it to a section
 * of a document, and leaving it out means the target itself rather than any
 * section of it.
 */
export class ReviewTargetQueryDto {
  @IsIn(REVIEW_TARGET_TYPES)
  targetType!: ReviewTargetType;

  @IsString()
  @IsNotEmpty()
  targetId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_REVIEW_TARGET_ANCHOR_LENGTH)
  anchor?: string;
}

/** The same address in a request body, where a version may be named too. */
export class ReviewTargetBodyDto extends ReviewTargetQueryDto {
  /** An `EntityVersion` id. Only an entity target has versions. */
  @IsOptional()
  @IsString()
  versionId?: string;
}

export class CreateCommentDto extends ReviewTargetBodyDto {
  /** Free text until authentication lands; then it comes from the session. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_COMMENT_AUTHOR_LENGTH)
  author!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_COMMENT_BODY_LENGTH)
  body!: string;
}

/** A reply names no target: it inherits the one its thread was opened on. */
export class CreateReplyDto {
  /** Free text until authentication lands; then it comes from the session. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_COMMENT_AUTHOR_LENGTH)
  author!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_COMMENT_BODY_LENGTH)
  body!: string;
}

/** Who is acting: the author for an edit or delete, the resolver for a resolve. */
export class ActorDto {
  /** Free text until authentication lands; then it comes from the session. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_COMMENT_AUTHOR_LENGTH)
  actor!: string;
}

export class UpdateCommentDto extends ActorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_COMMENT_BODY_LENGTH)
  body!: string;
}

export class RecordReviewDecisionDto extends ReviewTargetBodyDto {
  @IsIn(REVIEW_STATES)
  state!: ReviewState;

  /** Free text until authentication lands; then it comes from the session. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_REVIEW_ACTOR_LENGTH)
  actor!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_REVIEW_NOTE_LENGTH)
  note?: string;
}
