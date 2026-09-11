import { IsOptional, IsString } from 'class-validator';

/**
 * Which two versions to interpret. The facts themselves are re-read
 * server-side rather than posted back, so an interpretation can only ever be
 * of what is actually recorded.
 */
export class InterpretOutcomesDto {
  @IsString()
  from!: string;

  @IsString()
  to!: string;

  /** Free text until authentication lands; then it comes from the session. */
  @IsOptional()
  @IsString()
  createdBy?: string;
}
