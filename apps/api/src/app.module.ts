import { Module } from '@nestjs/common';

import { AssetsModule } from './assets/assets.module';
import { ApiConfigModule } from './config/config.module';
import { DomainModule } from './domain/domain.module';
import { EntitiesModule } from './entities/entities.module';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './infrastructure/database.module';
import { RedisModule } from './infrastructure/redis.module';
import { StorageModule } from './infrastructure/storage.module';
import { ProjectsModule } from './projects/projects.module';
import { RelationshipsModule } from './relationships/relationships.module';
import { VersionsModule } from './versions/versions.module';

/**
 * Root of the modular monolith.
 *
 * Feature modules are added here as they land. They stay in-process and share
 * the packages in `packages/` rather than being split into separate
 * deployables.
 */
@Module({
  imports: [
    ApiConfigModule,
    DatabaseModule,
    RedisModule,
    StorageModule,
    DomainModule,
    HealthModule,
    ProjectsModule,
    EntitiesModule,
    RelationshipsModule,
    VersionsModule,
    AssetsModule,
  ],
})
export class AppModule {}
