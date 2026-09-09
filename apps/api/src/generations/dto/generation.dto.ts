import {
  AI_CAPABILITIES,
  MAX_CONTEXT_DEPTH,
  MAX_CONTEXT_ENTITIES,
  type AiCapability,
} from '@level-zero/ai';
import {
  GENERATION_STATUSES,
  RELATION_TYPES,
  type GenerationStatus,
  type RelationType,
} from '@level-zero/domain';
import { Transform, Type } from 'class-transformer';
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

import { toStringArray } from '../../common/query';

/**
 * What the user pointed at when they asked, for `ContextResolver` to assemble.
 *
 * The instruction and the generation being re-rolled are not repeated here:
 * they are the request's own `prompt` and `parentGenerationId`.
 */
export class GenerationContextDto {
  /** Entities the user had selected. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedEntityIds?: string[];

  /** Entities named inline, e.g. by an `@mention` in the editor. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionedEntityIds?: string[];

  /** Assets chosen as references: a style plate, a pose, a palette. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assetIds?: string[];

  /** Relationship hops to follow out from the named entities. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_CONTEXT_DEPTH)
  relatedDepth?: number;

  /** Restricts the walk to these relations. Every relation is followed by default. */
  @IsOptional()
  @IsArray()
  @IsIn(RELATION_TYPES, { each: true })
  relations?: RelationType[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CONTEXT_ENTITIES)
  maxEntities?: number;
}

/**
 * The request is recorded before any provider is called, so a generation is
 * created from what was *asked for*: the capability, the prompt, the
 * parameters, and the entities and assets that went into it. Provider, model
 * and outputs arrive later, through `/dispatch` and `/complete`.
 *
 * `capability` is validated against `@level-zero/ai`'s vocabulary here rather
 * than in the domain, which stays free of the provider layer.
 */
export class CreateGenerationDto {
  @IsIn(AI_CAPABILITIES)
  capability!: AiCapability;

  @IsString()
  prompt!: string;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  inputEntityIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  inputAssetIds?: string[];

  /** Entities pulled in as ambient project context, not named by the user. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contextEntityIds?: string[];

  /**
   * What the user pointed at. Resolving it fills the id lists above and stores
   * the assembled context with the record, so a caller sends this *or* its own
   * ids, not both.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => GenerationContextDto)
  context?: GenerationContextDto;

  @IsOptional()
  @IsString()
  parentGenerationId?: string;

  @IsOptional()
  @IsString()
  seed?: string;

  /** Free text until authentication lands; then it comes from the session. */
  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class DispatchGenerationDto {
  @IsString()
  provider!: string;

  @IsString()
  model!: string;

  @IsOptional()
  @IsString()
  providerRequestId?: string;
}

export class CompleteGenerationDto {
  /** Assets already uploaded through the assets endpoint, never provider URLs. */
  @IsArray()
  @IsString({ each: true })
  outputAssetIds!: string[];

  /** Entities the generation produced or rewrote; each gets `generated_from` lineage. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  outputEntityIds?: string[];

  @IsOptional()
  @IsString()
  seed?: string;

  @IsOptional()
  @IsString()
  providerRequestId?: string;
}

export class FailGenerationDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  message!: string;

  /** Provider diagnostics: status codes, raw payloads, retry hints. */
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}

export class ListGenerationsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(GENERATION_STATUSES, { each: true })
  status?: GenerationStatus[];

  @IsOptional()
  @IsIn(AI_CAPABILITIES)
  capability?: AiCapability;

  @IsOptional()
  @IsString()
  parentGenerationId?: string;

  /** Which generation produced this asset. */
  @IsOptional()
  @IsString()
  outputAssetId?: string;

  /** Which generations this entity fed, as a named input or as project context. */
  @IsOptional()
  @IsString()
  entityId?: string;

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
