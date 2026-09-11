import { Module } from '@nestjs/common';

import { ActivityModule } from './activity/activity.module';
import { AssetsModule } from './assets/assets.module';
import { ApiConfigModule } from './config/config.module';
import { DocumentsModule } from './documents/documents.module';
import { DomainModule } from './domain/domain.module';
import { EntitiesModule } from './entities/entities.module';
import { FindingsModule } from './findings/findings.module';
import { GenerationsModule } from './generations/generations.module';
import { HealthModule } from './health/health.module';
import { AiModule } from './infrastructure/ai.module';
import { DatabaseModule } from './infrastructure/database.module';
import { EmbeddingModule } from './infrastructure/embedding.module';
import { QueueModule } from './infrastructure/queue.module';
import { RedisModule } from './infrastructure/redis.module';
import { StorageModule } from './infrastructure/storage.module';
import { InspectorModule } from './inspector/inspector.module';
import { JobsModule } from './jobs/jobs.module';
import { MoodboardsModule } from './moodboards/moodboards.module';
import { PlaytestsModule } from './playtests/playtests.module';
import { ProjectsModule } from './projects/projects.module';
import { PrototypesModule } from './prototypes/prototypes.module';
import { RelationshipsModule } from './relationships/relationships.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SearchModule } from './search/search.module';
import { SelectionsModule } from './selections/selections.module';
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
    AiModule,
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
    PlaytestsModule,
    MoodboardsModule,
    JobsModule,
    ActivityModule,
    SearchModule,
    FindingsModule,
    ReviewsModule,
    SelectionsModule,
    InspectorModule,
  ],
})
export class AppModule {}
