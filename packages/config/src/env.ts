/**
 * Isomorphic entry point: schemas and validation only, no Node built-ins.
 *
 * Browser bundles must import from `@level-zero/config/env` rather than the
 * package root, which also exports the filesystem-backed `loadDotEnv`.
 */
export { EnvValidationError, parseEnv } from './parse';
export {
  apiEnvSchema,
  sharedEnvSchema,
  webEnvSchema,
  workerEnvSchema,
  type ApiEnv,
  type SharedEnv,
  type WebEnv,
  type WorkerEnv,
} from './schemas';
