import {
  ENTITY_TYPES,
  SEARCH_SOURCE_TYPES,
  type EntityType,
  type SearchSourceType,
} from '@level-zero/domain';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { toBoolean, toStringArray } from '../../common/query';

/** How the question is answered: by the words in it, or by what it means. */
export const SEARCH_MODES = ['keyword', 'semantic'] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

export class SearchQueryDto {
  /** What to search for. Optional for `keyword`, which browses without it. */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(SEARCH_MODES)
  mode?: SearchMode;

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(SEARCH_SOURCE_TYPES, { each: true })
  sourceType?: SearchSourceType[];

  /** Scopes to entity types — this is what a local, per-tool search sends. */
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(ENTITY_TYPES, { each: true })
  entityType?: EntityType[];

  /** The source's own status: `draft`, `active`, `complete`, ... */
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  status?: string[];

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  tag?: string[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  updatedAfter?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  updatedBefore?: Date;

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
