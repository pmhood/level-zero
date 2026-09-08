import { Module } from '@nestjs/common';

import { ApiConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './infrastructure/database.module';
import { RedisModule } from './infrastructure/redis.module';

/**
 * Root of the modular monolith.
 *
 * Feature modules (projects, entities, assets, generations, ...) are added here
 * as they land. They stay in-process and share the packages in `packages/`
 * rather than being split into separate deployables.
 */
@Module({
  imports: [ApiConfigModule, DatabaseModule, RedisModule, HealthModule],
})
export class AppModule {}
