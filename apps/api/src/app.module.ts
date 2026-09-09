import { Module } from '@nestjs/common';

import { ActivityModule } from './activity/activity.module';
import { AssetsModule } from './assets/assets.module';
import { ApiConfigModule } from './config/config.module';
import { DocumentsModule } from './documents/documents.module';
import { DomainModule } from './domain/domain.module';
import { EntitiesModule } from './entities/entities.module';
import { GenerationsModule } from './generations/generations.module';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './infrastructure/database.module';
import { EmbeddingModule } from './infrastructure/embedding.module';
import { QueueModule } from './infrastructure/queue.module';
import { RedisModule } from './infrastructure/redis.module';
import { StorageModule } from './infrastructure/storage.module';
import { JobsModule } from './jobs/jobs.module';
import { MoodboardsModule } from './moodboards/moodboards.module';
import { ProjectsModule } from './projects/projects.module';
import { PrototypesModule } from './prototypes/prototypes.module';
import { RelationshipsModule } from './relationships/relationships.module';
import { SearchModule } from './search/search.module';
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
    QueueModule,
    StorageModule,
    EmbeddingModule,
    DomainModule,
    HealthModule,
    ProjectsModule,
    EntitiesModule,
    RelationshipsModule,
    VersionsModule,
    DocumentsModule,
    AssetsModule,
    GenerationsModule,
    PrototypesModule,
    MoodboardsModule,
    JobsModule,
    ActivityModule,
    SearchModule,
  ],
})
export class AppModule {}
