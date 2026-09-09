import { z } from 'zod';

const nodeEnv = z.enum(['development', 'test', 'production']).default('development');
const logLevel = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info');
const port = z.coerce.number().int().min(1).max(65_535);

/** Comma separated list -> trimmed, non-empty entries. */
const originList = z
  .string()
  .default('http://localhost:3000')
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );

/** Variables every server-side process needs. */
export const sharedEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  LOG_LEVEL: logLevel,
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required').startsWith('postgres'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required').startsWith('redis'),
  /** Directory local asset bytes are written under. See `@level-zero/storage`. */
  STORAGE_LOCAL_ROOT: z.string().min(1).default('./.data/assets'),
});

export const apiEnvSchema = sharedEnvSchema.extend({
  API_PORT: port.default(3001),
  API_CORS_ORIGINS: originList,
});

export const workerEnvSchema = sharedEnvSchema.extend({
  WORKER_PORT: port.default(3002),
  /**
   * Enables the Anthropic adapter for text capabilities. Without it the worker
   * registers the echo provider instead, so local development still runs.
   */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

/** Variables the browser bundle is allowed to see. */
export const webEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),
});

export type SharedEnv = z.infer<typeof sharedEnvSchema>;
export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;
