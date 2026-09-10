import {
  MOODBOARD_NODE_TYPES,
  RELATION_TYPES,
  type MoodboardNodeType,
  type RelationType,
} from '@level-zero/domain';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  registerDecorator,
  ValidateNested,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * At most this many patches in one `PATCH /nodes` request. A multi-select
 * drag is one gesture on one board, not an unbounded batch job; 200 matches
 * the cap the rest of the API already puts on a batch of anything (see the
 * `limit` fields on the `List*QueryDto`s).
 */
export const MAX_MOODBOARD_NODE_PATCHES = 200;

/**
 * Bytes a node's `data` may serialize to. It holds a tile's own content — a
 * caption, a palette, a URL — not an arbitrary payload; 8000 matches the
 * bound the API already puts on a comparable chunk of user content (see
 * `MAX_SUGGESTION_SELECTION_LENGTH` in the documents DTOs).
 */
export const MAX_MOODBOARD_NODE_DATA_BYTES = 8000;

/** Rejects a value whose JSON serialisation exceeds `maxBytes`. */
function MaxJsonSize(maxBytes: number, options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'maxJsonSize',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options,
      constraints: [maxBytes],
      validator: {
        validate(value: unknown, args?: ValidationArguments) {
          if (value === undefined || value === null) return true;
          const [limit] = (args?.constraints ?? []) as [number];
          try {
            return Buffer.byteLength(JSON.stringify(value), 'utf8') <= limit;
          } catch {
            return false;
          }
        },
        defaultMessage(args?: ValidationArguments) {
          const [limit] = (args?.constraints ?? []) as [number];
          return `${args?.property} must serialize to at most ${limit} bytes`;
        },
      },
    });
  };
}

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
  @MaxJsonSize(MAX_MOODBOARD_NODE_DATA_BYTES)
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
  @ArrayMaxSize(MAX_MOODBOARD_NODE_PATCHES)
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

export class RemoveMoodboardNodesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  nodeIds!: string[];
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
