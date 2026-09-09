import {
  ASSET_KINDS,
  ASSET_STATUSES,
  ASSET_VARIANTS,
  type AssetKind,
  type AssetStatus,
  type AssetVariant,
} from '@level-zero/domain';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBase64,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { toBoolean, toStringArray } from '../../common/query';

/**
 * Uploads take the file as base64 in the request body rather than a
 * multipart form: it keeps the endpoint a plain JSON contract, matching every
 * other endpoint in the API.
 */
export class CreateAssetDto {
  @IsIn(ASSET_KINDS)
  kind!: AssetKind;

  @IsString()
  filename!: string;

  @IsString()
  mimeType!: string;

  @IsBase64()
  contentBase64!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  height?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsIn(ASSET_VARIANTS)
  variant?: AssetVariant;

  @IsOptional()
  @IsString()
  sourceAssetId?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class ListAssetsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(ASSET_KINDS, { each: true })
  kind?: AssetKind[];

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(ASSET_VARIANTS, { each: true })
  variant?: AssetVariant[];

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(ASSET_STATUSES, { each: true })
  status?: AssetStatus[];

  @IsOptional()
  @IsString()
  sourceAssetId?: string;

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
