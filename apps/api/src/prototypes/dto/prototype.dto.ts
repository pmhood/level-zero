import { PROTOTYPE_VERSION_STATUSES, type PrototypeVersionStatus } from '@level-zero/domain';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * One entity to include. Leaving `entityVersionId` out pins the entity's
 * current version at the moment of capture, which is resolved once and never
 * re-resolved on read.
 */
export class PrototypeMemberDto {
  @IsString()
  entityId!: string;

  @IsOptional()
  @IsString()
  entityVersionId?: string;
}

export class CapturePrototypeVersionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrototypeMemberDto)
  members!: PrototypeMemberDto[];

  /** Optional label; the version number is the identity. */
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(PROTOTYPE_VERSION_STATUSES)
  status?: PrototypeVersionStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  /** An asset already uploaded through the assets endpoint. */
  @IsOptional()
  @IsString()
  buildAssetId?: string;

  /** Free text until authentication lands; then it comes from the session. */
  @IsOptional()
  @IsString()
  createdBy?: string;
}

/** Creates the prototype entity and captures its first version in one request. */
export class CreatePrototypeDto extends CapturePrototypeVersionDto {
  @IsString()
  prototypeName!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

/** Annotations only — the pinned entity versions are never rewritten. */
export class AnnotatePrototypeVersionDto {
  @IsOptional()
  @IsIn(PROTOTYPE_VERSION_STATUSES)
  status?: PrototypeVersionStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  buildAssetId?: string;
}

export class ListPrototypeVersionsQueryDto {
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

export class ComparePrototypeVersionsQueryDto {
  @IsString()
  from!: string;

  @IsString()
  to!: string;
}
