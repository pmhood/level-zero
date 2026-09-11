import { FINDING_STATUSES, type FindingStatus } from '@level-zero/domain';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { toStringArray } from '../../common/query';

export class ListFindingsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(FINDING_STATUSES, { each: true })
  status?: FindingStatus[];

  /** The `ConsistencyCheck.id` that produced the finding, e.g. `duplicate-name`. */
  @IsOptional()
  @IsString()
  checkId?: string;

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

export class DismissFindingDto {
  /** Free text until authentication lands; then it comes from the session. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  dismissedBy!: string;

  /** Optional note the dismissing user leaves for whoever reads this later. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
