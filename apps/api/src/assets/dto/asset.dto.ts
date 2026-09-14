import {
  ASSET_KINDS,
  ASSET_MARK_KINDS,
  ASSET_ORIGINS,
  ASSET_SELECTION_STATES,
  ASSET_SORT_DIRECTIONS,
  ASSET_SORT_FIELDS,
  ASSET_STATUSES,
  ASSET_VARIANTS,
  type AssetKind,
  type AssetMarkKind,
  type AssetOrigin,
  type AssetSelectionState,
  type AssetSortDirection,
  type AssetSortField,
  type AssetStatus,
  type AssetVariant,
} from '@level-zero/domain';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBase64,
  IsBoolean,
  IsDate,
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

  /** Matches the part of `mimeType` before the slash: "image", "video", ... */
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  mimeFamily?: string[];

  /** Inclusive lower bound on `createdAt`. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdAfter?: Date;

  /** Exclusive upper bound on `createdAt`. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdBefore?: Date;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  includeArchived?: boolean;

  /**
   * Opts into the joined library view: items come back with their
   * `AssetSummary`. A summary-only filter (`origin`, `markKinds`,
   * `selectionStates`, `linkedEntityId` or `collectionId`) implies this, so
   * a caller that only wants one of those filters doesn't also have to ask.
   */
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  summary?: boolean;

  /** Generated-vs-imported. Narrows in SQL and is reflected in `total`. */
  @IsOptional()
  @IsIn(ASSET_ORIGINS)
  origin?: AssetOrigin;

  /** Mark kinds to filter by. Asset matches when it carries any of the requested kinds. */
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(ASSET_MARK_KINDS, { each: true })
  markKinds?: AssetMarkKind[];

  /**
   * Selection states to filter by. Asset matches when it has a *current*
   * selection in one of these states, in any context.
   */
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(ASSET_SELECTION_STATES, { each: true })
  selectionStates?: AssetSelectionState[];

  /**
   * Narrows to assets reachable from this entity: its `asset_reference`
   * entity has a relationship edge to it, in either direction.
   */
  @IsOptional()
  @IsString()
  linkedEntityId?: string;

  /** Narrows to assets whose `asset_reference` entity is a member of this collection. */
  @IsOptional()
  @IsString()
  collectionId?: string;

  @IsOptional()
  @IsIn(ASSET_SORT_FIELDS)
  sortBy?: AssetSortField;

  @IsOptional()
  @IsIn(ASSET_SORT_DIRECTIONS)
  sortDirection?: AssetSortDirection;

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
