import {
  PLAYTEST_SENTIMENTS,
  PLAYTEST_STATUSES,
  type PlaytestSentiment,
  type PlaytestStatus,
} from '@level-zero/domain';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

import { toStringArray } from '../../common/query';

export class CreatePlaytestDto {
  /** The exact version this playtest is evidence about; never rewritten after creation. */
  @IsString()
  prototypeVersionId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsIn(PLAYTEST_STATUSES)
  status?: PlaytestStatus;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  /** Free text until authentication lands; then it comes from the session. */
  @IsOptional()
  @IsString()
  createdBy?: string;
}

/** The pinned `prototypeVersionId` is never rewritten — only these fields can change. */
export class UpdatePlaytestDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsIn(PLAYTEST_STATUSES)
  status?: PlaytestStatus;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ListPlaytestsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  tag?: string[];

  /** Scopes to playtests of one exact prototype version — there is no `prototypeId`. */
  @IsOptional()
  @IsString()
  prototypeVersionId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class RecordPlaytestSessionDto {
  /** A participant is not a user account, so this is free text. */
  @IsOptional()
  @IsString()
  participant?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Date)
  startedAt?: Date;

  @IsOptional()
  @Type(() => Date)
  endedAt?: Date;
}

export class RecordPlaytestObservationDto {
  /** The run this was noticed in; omit for a whole-playtest note. */
  @IsOptional()
  @IsString()
  sessionId?: string;

  /** Narrows the observation to one thing in the game. */
  @IsOptional()
  @IsString()
  entityId?: string;

  /** Offset into the session, where one is known. */
  @IsOptional()
  @IsInt()
  @Min(0)
  atSeconds?: number;

  @IsString()
  body!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  observedBy?: string;
}

export class RecordPlaytestFeedbackDto {
  /** The run this was said in; omit for a whole-playtest remark. */
  @IsOptional()
  @IsString()
  sessionId?: string;

  /** The participant's own words, stored verbatim. */
  @IsString()
  body!: string;

  @IsOptional()
  @IsIn(PLAYTEST_SENTIMENTS)
  sentiment?: PlaytestSentiment;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  author?: string;
}

export class RecordPlaytestMetricDto {
  /** Set for a per-run measurement; omit for a playtest-level figure. */
  @IsOptional()
  @IsString()
  sessionId?: string;

  /** A label matching an existing metric on this playtest reuses its key. */
  @IsString()
  label!: string;

  @IsNumber()
  value!: number;

  /** `s`, `%`, `m/s`, ... */
  @IsOptional()
  @IsString()
  unit?: string;
}
