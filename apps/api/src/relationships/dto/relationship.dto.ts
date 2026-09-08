import {
  ENTITY_TYPES,
  RELATION_TYPES,
  type EntityStatus,
  type EntityType,
  type RelationType,
  type RelationshipDirection,
} from '@level-zero/domain';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

import { toStringArray } from '../../common/query';

export class CreateRelationshipDto {
  @IsString()
  targetEntityId!: string;

  @IsIn(RELATION_TYPES)
  relation!: RelationType;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ListRelationshipsQueryDto {
  @IsOptional()
  @IsIn(['outgoing', 'incoming', 'both'])
  direction?: RelationshipDirection;

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(RELATION_TYPES, { each: true })
  relation?: RelationType[];

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

export class PromoteEntityDto {
  @IsIn(ENTITY_TYPES)
  type!: EntityType;

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

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
