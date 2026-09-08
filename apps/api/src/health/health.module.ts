import {
  checkPostgres,
  checkRedis,
  type DatabaseClient,
  type RedisClient,
} from '@level-zero/database';
import { Module } from '@nestjs/common';

import { DATABASE_CLIENT } from '../infrastructure/database.module';
import { REDIS_CLIENT } from '../infrastructure/redis.module';
import { HealthController } from './health.controller';
import { HEALTH_PROBES, HealthService } from './health.service';
import { type HealthProbe } from './health.types';

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: HEALTH_PROBES,
      inject: [DATABASE_CLIENT, REDIS_CLIENT],
      useFactory: (database: DatabaseClient, redis: RedisClient): HealthProbe[] => [
        { name: 'postgres', check: () => checkPostgres(database.db) },
        { name: 'redis', check: () => checkRedis(redis.redis) },
      ],
    },
    HealthService,
  ],
  exports: [HealthService],
})
export class HealthModule {}
