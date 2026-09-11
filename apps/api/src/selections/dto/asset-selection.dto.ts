import {
  ASSET_MARK_KINDS,
  MAX_ASSET_MARK_ACTOR_LENGTH,
  MAX_ASSET_SELECTION_ACTOR_LENGTH,
  MAX_ASSET_SELECTION_NOTE_LENGTH,
  MAX_ASSET_SELECTION_PURPOSE_LENGTH,
  type AssetMarkKind,
} from '@level-zero/domain';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { toStringArray } from '../../common/query';

/**
 * What an approval is for: the entity, and what the asset was chosen *as*.
 *
 * Both halves are required, because an approval that cannot say what it is for
 * is the thing this endpoint exists to replace.
 */
export class AssetSelectionContextQueryDto {
  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_ASSET_SELECTION_PURPOSE_LENGTH)
  purpose!: string;
}

export class DecideAssetSelectionDto extends AssetSelectionContextQueryDto {
  @IsString()
  @IsNotEmpty()
  assetId!: string;

  /** Free text until authentication lands; then it comes from the session. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_ASSET_SELECTION_ACTOR_LENGTH)
  actor!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_ASSET_SELECTION_NOTE_LENGTH)
  note?: string;
}

export class ApproveAssetSelectionDto extends DecideAssetSelectionDto {
  /** Assets this approval replaces, each currently approved for this purpose. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  supersedes?: string[];
}

export class ListAssetMarksQueryDto {
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(ASSET_MARK_KINDS, { each: true })
  kind?: AssetMarkKind[];
}

export class MarkAssetDto {
  @IsString()
  @IsNotEmpty()
  assetId!: string;

  @IsIn(ASSET_MARK_KINDS)
  kind!: AssetMarkKind;

  /** Free text until authentication lands; then it comes from the session. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_ASSET_MARK_ACTOR_LENGTH)
  actor!: string;
}
