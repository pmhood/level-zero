import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/** Longest passage the editor may hand over for one suggestion. */
export const MAX_SUGGESTION_SELECTION_LENGTH = 8000;
export const MAX_SUGGESTION_INSTRUCTION_LENGTH = 2000;

/**
 * One inline AI request from the editor.
 *
 * The instruction is sent as the writer's action phrased it — the action
 * catalogue lives in the editor, so the API never has to keep a second copy of
 * what "Make it concise" means. What it does add is the invariants every
 * suggestion has to satisfy, which are the same whatever was asked.
 */
export class SuggestDocumentEditDto {
  /** Which editor action asked, recorded on the generation. */
  @IsString()
  @MaxLength(100)
  action!: string;

  @IsString()
  @MaxLength(MAX_SUGGESTION_INSTRUCTION_LENGTH)
  instruction!: string;

  /** The passage being rewritten. Empty for an `/ai` request at the caret. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SUGGESTION_SELECTION_LENGTH)
  selection?: string;

  /** Entities mentioned inside the passage, so they are named context, not ambient. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionedEntityIds?: string[];

  /** Free text until authentication lands; then it comes from the session. */
  @IsOptional()
  @IsString()
  createdBy?: string;
}
