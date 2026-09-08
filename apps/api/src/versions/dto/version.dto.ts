import { VERSION_REASONS, type VersionReason } from '@level-zero/domain';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class CommitVersionDto {
  @IsOptional()
  @IsIn(VERSION_REASONS)
  reason?: VersionReason;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  /** Free text until authentication lands; then it comes from the session. */
  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class BranchVersionDto {
  @IsString()
  branchName!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class PromoteVersionDto {
  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class RestoreVersionDto {
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class ListVersionsQueryDto {
  @IsOptional()
  @IsString()
  branch?: string;

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

export class CompareVersionsQueryDto {
  @IsString()
  from!: string;

  @IsString()
  to!: string;
}
