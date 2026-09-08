import { type ApiEnv } from '@level-zero/config';
import { createRedisClient, type RedisClient } from '@level-zero/database';
import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';

import { API_ENV } from '../config/config.module';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
export class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: RedisClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [API_ENV],
      useFactory: (env: ApiEnv): RedisClient =>
        createRedisClient({ connectionUrl: env.REDIS_URL, keyPrefix: 'level-zero:' }),
    },
    RedisLifecycle,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
