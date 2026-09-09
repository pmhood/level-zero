import { AI_CAPABILITIES, type AiCapability } from '@level-zero/ai';
import { GENERATION_STATUSES, type GenerationStatus } from '@level-zero/domain';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

import { toStringArray } from '../../common/query';

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
