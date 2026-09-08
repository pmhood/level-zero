import { type ApiEnv } from '@level-zero/config';
import { createDatabaseClient, type DatabaseClient } from '@level-zero/database';
import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';

import { API_ENV } from '../config/config.module';

export const DATABASE_CLIENT = Symbol('DATABASE_CLIENT');

/** Closes the connection pool when Nest shuts down so the process can exit. */
@Injectable()
export class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_CLIENT) private readonly client: DatabaseClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CLIENT,
      inject: [API_ENV],
      useFactory: (env: ApiEnv): DatabaseClient =>
        createDatabaseClient({
          connectionString: env.DATABASE_URL,
          logQueries: env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace',
        }),
    },
    DatabaseLifecycle,
  ],
  exports: [DATABASE_CLIENT],
})
export class DatabaseModule {}
