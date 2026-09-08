import type { z } from 'zod';

/** Thrown when the process environment does not satisfy a schema. */
export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(context: string, issues: readonly string[]) {
    super(
      `Invalid environment for ${context}:\n` +
        issues.map((issue) => `  - ${issue}`).join('\n') +
        '\nSee .env.example for the expected variables.',
    );
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/**
 * Validates `source` against `schema`, reporting *every* problem at once
 * instead of failing on the first missing variable.
 */
export function parseEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  context: string,
  source: Record<string, string | undefined> = process.env,
): z.infer<TSchema> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;

  const issues = result.error.issues.map((issue) => {
    const path = issue.path.join('.') || '(root)';
    return `${path}: ${issue.message}`;
  });
  throw new EnvValidationError(context, issues);
}
