import { ACTIVITY_TYPES, type ActivityType } from '@level-zero/domain';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { toStringArray } from '../../common/query';

export class ListActivityQueryDto {
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(ACTIVITY_TYPES, { each: true })
  type?: ActivityType[];

  /** Scopes the feed to one subject, for a contextual workspace view. */
  @IsOptional()
  @IsString()
  subjectId?: string;

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
