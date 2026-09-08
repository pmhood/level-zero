import { parseEnv, webEnvSchema } from '@level-zero/config/env';

/**
 * Only `NEXT_PUBLIC_*` values are read here. Each one is referenced statically
 * so Next can inline it into the browser bundle, and validation runs in both
 * the server and client bundles.
 */
export const env = parseEnv(webEnvSchema, 'web', {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});
