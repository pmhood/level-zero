import { apiEnvSchema, parseEnv, type ApiEnv } from '@level-zero/config';
import { Global, Module } from '@nestjs/common';

/** Injection token for the validated API environment. */
export const API_ENV = Symbol('API_ENV');

/**
 * Validates the environment once, at module construction, so a misconfigured
 * process fails immediately instead of when the first request arrives.
 */
@Global()
@Module({
  providers: [
    {
      provide: API_ENV,
      useFactory: (): ApiEnv => parseEnv(apiEnvSchema, 'api'),
    },
  ],
  exports: [API_ENV],
})
export class ApiConfigModule {}
