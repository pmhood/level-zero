import { PROJECT_STATUSES, type ProjectStatus } from '@level-zero/domain';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { toStringArray } from '../../common/query';

/**
 * DTOs check the *shape* of a request. The rules — trimming, length limits,
 * status transitions — belong to the domain model and are enforced there.
 */
export class CreateProjectDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class ListProjectsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(PROJECT_STATUSES, { each: true })
  status?: ProjectStatus[];

  @IsOptional()
  @IsString()
  search?: string;

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
