import { JOB_KINDS, JOB_STATUSES, type JobKind, type JobStatus } from '@level-zero/domain';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { toStringArray } from '../../common/query';

export class ListJobsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(JOB_STATUSES, { each: true })
  status?: JobStatus[];

  @IsOptional()
  @IsIn(JOB_KINDS)
  kind?: JobKind;

  /** The record the job acts on — a generation id, for `generation` jobs. */
  @IsOptional()
  @IsString()
  targetId?: string;

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
