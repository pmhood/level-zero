import { AI_CAPABILITIES, MAX_CONTEXT_DEPTH, type AiCapability } from '@level-zero/ai';
import { MAX_ENTITY_DESCRIPTION_LENGTH, MAX_ENTITY_NAME_LENGTH } from '@level-zero/domain';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const MAX_INSPECTOR_INSTRUCTION_LENGTH = 2000;
/** Longest run of workspace material the inspector may hand over with one ask. */
export const MAX_INSPECTOR_EXCERPT_LENGTH = 8000;

/**
 * One contextual AI action from the inspector.
 *
 * The instruction arrives as the action phrased it, the same way
 * `SuggestDocumentEditDto` carries the editor's wording: the action catalogue
 * is workspace knowledge, and the API has no reason to keep a second copy of
 * what "Critique the rules" means. What the API does own is the capability the
 * action asks for — a request naming one no provider serves is refused before
 * anything is recorded — and the invariants every answer has to satisfy.
 */
export class RunInspectorActionDto {
  /** Which inspector action asked, recorded on the generation. */
  @IsString()
  @MaxLength(100)
  action!: string;

  @IsIn(AI_CAPABILITIES)
  capability!: AiCapability;

  @IsString()
  @MaxLength(MAX_INSPECTOR_INSTRUCTION_LENGTH)
  instruction!: string;

  /** The subject the user has selected. Empty for a project-level question. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedEntityIds?: string[];

  /** Entities named inline in the ask, so they are named context, not ambient. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionedEntityIds?: string[];

  /** The selected asset, for an asset subject. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assetIds?: string[];

  /**
   * Workspace material the relationship graph does not hold — a prototype's
   * version history, say. Quoted verbatim into the prompt.
   */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_INSPECTOR_EXCERPT_LENGTH)
  excerpt?: string;

  /** Hops to follow out from the subject. `0` asks about the subject alone. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_CONTEXT_DEPTH)
  relatedDepth?: number;

  /** Free text until authentication lands; then it comes from the session. */
  @IsOptional()
  @IsString()
  createdBy?: string;
}

/**
 * Accepting one recommendation.
 *
 * The text is sent back rather than read off the record because the record
 * deliberately never stored it: until someone accepts it, model output is not
 * part of the project. Accepting writes a *new* draft idea, so no canonical
 * object is rewritten by this call either.
 */
export class ApplyInspectorResultDto {
  @IsString()
  @MaxLength(MAX_ENTITY_NAME_LENGTH)
  name!: string;

  @IsString()
  @MaxLength(MAX_ENTITY_DESCRIPTION_LENGTH)
  text!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
