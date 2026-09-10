import {
  ENTITY_STATUSES,
  ENTITY_TYPES,
  type EntityStatus,
  type EntityType,
} from '@level-zero/domain';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { toBoolean, toStringArray } from '../../common/query';

export class CreateEntityDto {
  @IsIn(ENTITY_TYPES)
  type!: EntityType;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsIn(['draft', 'active'])
  status?: Exclude<EntityStatus, 'archived'>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  /** Type-specific fields. Deliberately unconstrained; see `Entity.data`. */
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class UpdateEntityDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsIn(['draft', 'active'])
  status?: Exclude<EntityStatus, 'archived'>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class FindOrCreateAssetReferenceDto {
  @IsString()
  assetId!: string;

  @IsString()
  name!: string;
}

export class ListEntitiesQueryDto {
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(ENTITY_TYPES, { each: true })
  type?: EntityType[];

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(ENTITY_STATUSES, { each: true })
  status?: EntityStatus[];

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  tag?: string[];

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  includeArchived?: boolean;

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
