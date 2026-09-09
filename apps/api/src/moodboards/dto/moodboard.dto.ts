import {
  MOODBOARD_NODE_TYPES,
  RELATION_TYPES,
  type MoodboardNodeType,
  type RelationType,
} from '@level-zero/domain';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** Where a node sits. Shared by placement and by every later layout change. */
export class MoodboardNodeLayoutDto {
  @IsOptional()
  @IsNumber()
  x?: number;

  @IsOptional()
  @IsNumber()
  y?: number;

  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  /** Clockwise, in radians. */
  @IsOptional()
  @IsNumber()
  rotation?: number;

  @IsOptional()
  @IsInt()
  zOrder?: number;

  /** The `group` node this one belongs to; `null` takes it out of its group. */
  @IsOptional()
  @IsString()
  groupId?: string | null;

  @IsOptional()
  @IsBoolean()
  locked?: boolean;

  /** Node-kind content: the text, the palette's colours, the link's URL. */
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

/**
 * Places something on the board.
 *
 * An `asset` node names an asset already in the library and an `entity` node a
 * canonical entity; neither is copied. The other types carry their content in
 * `data` and reference nothing.
 */
export class AddMoodboardNodeDto extends MoodboardNodeLayoutDto {
  @IsIn(MOODBOARD_NODE_TYPES)
  type!: MoodboardNodeType;

  @IsOptional()
  @IsString()
  assetId?: string;

  @IsOptional()
  @IsString()
  entityId?: string;
}

/** One node's share of a bulk layout change. */
export class MoodboardNodePatchDto extends MoodboardNodeLayoutDto {
  @IsString()
  id!: string;
}

export class UpdateMoodboardNodesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MoodboardNodePatchDto)
  nodes!: MoodboardNodePatchDto[];
}

export class DuplicateMoodboardNodesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  nodeIds!: string[];

  /** How far the copies are offset, so they are visibly copies. */
  @IsOptional()
  @IsNumber()
  offset?: number;
}

export class ConnectMoodboardNodesDto {
  @IsString()
  fromNodeId!: string;

  @IsString()
  toNodeId!: string;

  @IsOptional()
  @IsString()
  label?: string;
}

export class AnnotateMoodboardConnectorDto {
  @IsOptional()
  @IsString()
  label?: string | null;
}

/** The relation the line stands for, chosen deliberately at promotion time. */
export class PromoteMoodboardConnectorDto {
  @IsIn(RELATION_TYPES)
  relation!: RelationType;
}
