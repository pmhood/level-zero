import {
  DrizzleActivityRepository,
  DrizzleAssetLibraryReadModel,
  DrizzleAssetMarkRepository,
  DrizzleAssetRepository,
  DrizzleAssetSelectionRepository,
  DrizzleCommentRepository,
  DrizzleEntityRelationshipRepository,
  DrizzleEntityRepository,
  DrizzleEntityVersionRepository,
  DrizzleFindingRepository,
  DrizzleGenerationRepository,
  DrizzleJobRepository,
  DrizzleMoodboardRepository,
  DrizzlePlaytestRepository,
  DrizzleProjectRepository,
  DrizzlePrototypeVersionRepository,
  DrizzleReviewDecisionRepository,
  DrizzleSearchDocumentRepository,
  type DatabaseClient,
} from '@level-zero/database';
import {
  ActivityService,
  AssetCollectionService,
  AssetLibraryService,
  AssetSelectionService,
  AssetService,
  CommentService,
  ConsistencyScanService,
  DocumentService,
  EntityRelationshipService,
  EntityService,
  EntityVersionService,
  FindingService,
  GenerationService,
  JobService,
  LineageService,
  MoodboardService,
  OutcomeComparisonService,
  PlaytestService,
  ProjectService,
  PrototypeService,
  ReviewService,
  ReviewTargetResolver,
  SearchIndexService,
  SearchService,
  systemClock,
  uuidIdGenerator,
  type ActivityRepository,
  type AssetLibraryReadModel,
  type AssetMarkRepository,
  type AssetRepository,
  type AssetSelectionRepository,
  type CommentRepository,
  type EntityRelationshipRepository,
  type EntityRepository,
  type EmbeddingProvider,
  type EntityVersionRepository,
  type EntityServiceDeps,
  type FindingRepository,
  type GenerationRepository,
  type JobEvents,
  type JobQueue,
  type JobRepository,
  type MoodboardRepository,
  type ObjectStorageProvider,
  type PlaytestRepository,
  type ProjectRepository,
  type PrototypeVersionRepository,
  type ReviewDecisionRepository,
  type SearchDocumentRepository,
} from '@level-zero/domain';
import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { DATABASE_CLIENT } from '../infrastructure/database.module';
import { EMBEDDING_PROVIDER } from '../infrastructure/embedding.module';
import { JOB_EVENTS, JOB_QUEUE } from '../infrastructure/queue.module';
import { OBJECT_STORAGE } from '../infrastructure/storage.module';

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');
export const ENTITY_REPOSITORY = Symbol('ENTITY_REPOSITORY');
export const ACTIVITY_REPOSITORY = Symbol('ACTIVITY_REPOSITORY');
export const RELATIONSHIP_REPOSITORY = Symbol('RELATIONSHIP_REPOSITORY');
export const VERSION_REPOSITORY = Symbol('VERSION_REPOSITORY');
export const ASSET_REPOSITORY = Symbol('ASSET_REPOSITORY');
export const ASSET_LIBRARY_READ_MODEL = Symbol('ASSET_LIBRARY_READ_MODEL');
export const GENERATION_REPOSITORY = Symbol('GENERATION_REPOSITORY');
export const PROTOTYPE_VERSION_REPOSITORY = Symbol('PROTOTYPE_VERSION_REPOSITORY');
export const PLAYTEST_REPOSITORY = Symbol('PLAYTEST_REPOSITORY');
export const JOB_REPOSITORY = Symbol('JOB_REPOSITORY');
export const MOODBOARD_REPOSITORY = Symbol('MOODBOARD_REPOSITORY');
export const SEARCH_DOCUMENT_REPOSITORY = Symbol('SEARCH_DOCUMENT_REPOSITORY');
export const FINDING_REPOSITORY = Symbol('FINDING_REPOSITORY');
export const COMMENT_REPOSITORY = Symbol('COMMENT_REPOSITORY');
export const REVIEW_DECISION_REPOSITORY = Symbol('REVIEW_DECISION_REPOSITORY');
export const ASSET_SELECTION_REPOSITORY = Symbol('ASSET_SELECTION_REPOSITORY');
export const ASSET_MARK_REPOSITORY = Symbol('ASSET_MARK_REPOSITORY');
export const DOMAIN_DEPS = Symbol('DOMAIN_DEPS');

/**
 * Wires the framework-free domain services to their Postgres adapters.
 *
 * Controllers depend on the services, never on a repository or on Drizzle, so
 * swapping storage does not reach into feature code.
 */
@Global()
@Module({
  providers: [
    {
      provide: DOMAIN_DEPS,
      useValue: { clock: systemClock, ids: uuidIdGenerator } satisfies EntityServiceDeps,
    },
    {
      provide: PROJECT_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): ProjectRepository =>
        new DrizzleProjectRepository(client.db),
    },
    {
      provide: ENTITY_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): EntityRepository =>
        new DrizzleEntityRepository(client.db),
    },
    {
      provide: ACTIVITY_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): ActivityRepository =>
        new DrizzleActivityRepository(client.db),
    },
    {
      provide: ActivityService,
      inject: [ACTIVITY_REPOSITORY, DOMAIN_DEPS],
      useFactory: (activities: ActivityRepository, deps: EntityServiceDeps): ActivityService =>
        new ActivityService(activities, deps),
    },
    {
      provide: ProjectService,
      inject: [PROJECT_REPOSITORY, DOMAIN_DEPS],
      useFactory: (projects: ProjectRepository, deps: EntityServiceDeps): ProjectService =>
        new ProjectService(projects, deps),
    },
    {
      provide: EntityService,
      inject: [
        ENTITY_REPOSITORY,
        PROJECT_REPOSITORY,
        ActivityService,
        DOMAIN_DEPS,
        SearchIndexService,
      ],
      useFactory: (
        entities: EntityRepository,
        projects: ProjectRepository,
        activity: ActivityService,
        deps: EntityServiceDeps,
        search: SearchIndexService,
      ): EntityService => new EntityService(entities, projects, activity, deps, search),
    },
    {
      provide: RELATIONSHIP_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): EntityRelationshipRepository =>
        new DrizzleEntityRelationshipRepository(client.db),
    },
    {
      provide: EntityRelationshipService,
      inject: [RELATIONSHIP_REPOSITORY, ENTITY_REPOSITORY, DOMAIN_DEPS],
      useFactory: (
        relationships: EntityRelationshipRepository,
        entities: EntityRepository,
        deps: EntityServiceDeps,
      ): EntityRelationshipService => new EntityRelationshipService(relationships, entities, deps),
    },
    {
      provide: LineageService,
      inject: [EntityService, EntityRelationshipService, ActivityService],
      useFactory: (
        entities: EntityService,
        relationships: EntityRelationshipService,
        activity: ActivityService,
      ): LineageService => new LineageService(entities, relationships, activity),
    },
    {
      provide: VERSION_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): EntityVersionRepository =>
        new DrizzleEntityVersionRepository(client.db),
    },
    {
      provide: EntityVersionService,
      inject: [
        VERSION_REPOSITORY,
        ENTITY_REPOSITORY,
        ActivityService,
        DOMAIN_DEPS,
        SearchIndexService,
      ],
      useFactory: (
        versions: EntityVersionRepository,
        entities: EntityRepository,
        activity: ActivityService,
        deps: EntityServiceDeps,
        search: SearchIndexService,
      ): EntityVersionService =>
        new EntityVersionService(versions, entities, activity, deps, search),
    },
    {
      provide: DocumentService,
      inject: [EntityService, EntityVersionService],
      useFactory: (entities: EntityService, versions: EntityVersionService): DocumentService =>
        new DocumentService(entities, versions),
    },
    {
      provide: ASSET_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): AssetRepository =>
        new DrizzleAssetRepository(client.db),
    },
    {
      provide: AssetService,
      inject: [
        ASSET_REPOSITORY,
        PROJECT_REPOSITORY,
        OBJECT_STORAGE,
        DOMAIN_DEPS,
        SearchIndexService,
        JobService,
      ],
      useFactory: (
        assets: AssetRepository,
        projects: ProjectRepository,
        storage: ObjectStorageProvider,
        deps: EntityServiceDeps,
        search: SearchIndexService,
        jobs: JobService,
      ): AssetService => new AssetService(assets, projects, storage, deps, search, jobs),
    },
    {
      provide: ASSET_LIBRARY_READ_MODEL,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): AssetLibraryReadModel =>
        new DrizzleAssetLibraryReadModel(client.db),
    },
    {
      provide: AssetLibraryService,
      inject: [ASSET_LIBRARY_READ_MODEL],
      useFactory: (readModel: AssetLibraryReadModel): AssetLibraryService =>
        new AssetLibraryService(readModel),
    },
    {
      provide: AssetCollectionService,
      inject: [EntityService, EntityRelationshipService, ASSET_REPOSITORY],
      useFactory: (
        entities: EntityService,
        relationships: EntityRelationshipService,
        assets: AssetRepository,
      ): AssetCollectionService => new AssetCollectionService(entities, relationships, assets),
    },
    {
      provide: GENERATION_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): GenerationRepository =>
        new DrizzleGenerationRepository(client.db),
    },
    {
      provide: GenerationService,
      inject: [
        GENERATION_REPOSITORY,
        PROJECT_REPOSITORY,
        ENTITY_REPOSITORY,
        ASSET_REPOSITORY,
        LineageService,
        ActivityService,
        DOMAIN_DEPS,
        SearchIndexService,
      ],
      useFactory: (
        generations: GenerationRepository,
        projects: ProjectRepository,
        entities: EntityRepository,
        assets: AssetRepository,
        lineage: LineageService,
        activity: ActivityService,
        deps: EntityServiceDeps,
        search: SearchIndexService,
      ): GenerationService =>
        new GenerationService(
          generations,
          projects,
          entities,
          assets,
          lineage,
          activity,
          deps,
          search,
        ),
    },
    {
      provide: PROTOTYPE_VERSION_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): PrototypeVersionRepository =>
        new DrizzlePrototypeVersionRepository(client.db),
    },
    {
      provide: PrototypeService,
      inject: [
        PROTOTYPE_VERSION_REPOSITORY,
        EntityService,
        VERSION_REPOSITORY,
        ASSET_REPOSITORY,
        ActivityService,
        EntityRelationshipService,
        DOMAIN_DEPS,
      ],
      useFactory: (
        prototypeVersions: PrototypeVersionRepository,
        entities: EntityService,
        versions: EntityVersionRepository,
        assets: AssetRepository,
        activity: ActivityService,
        relationships: EntityRelationshipService,
        deps: EntityServiceDeps,
      ): PrototypeService =>
        new PrototypeService(
          prototypeVersions,
          entities,
          versions,
          assets,
          activity,
          relationships,
          deps,
        ),
    },
    {
      provide: PLAYTEST_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): PlaytestRepository =>
        new DrizzlePlaytestRepository(client.db),
    },
    {
      provide: PlaytestService,
      inject: [
        PLAYTEST_REPOSITORY,
        PROTOTYPE_VERSION_REPOSITORY,
        EntityService,
        ActivityService,
        DOMAIN_DEPS,
      ],
      useFactory: (
        playtests: PlaytestRepository,
        prototypeVersions: PrototypeVersionRepository,
        entities: EntityService,
        activity: ActivityService,
        deps: EntityServiceDeps,
      ): PlaytestService =>
        new PlaytestService(playtests, prototypeVersions, entities, activity, deps),
    },
    {
      provide: OutcomeComparisonService,
      inject: [PrototypeService, PLAYTEST_REPOSITORY],
      useFactory: (
        prototypes: PrototypeService,
        playtests: PlaytestRepository,
      ): OutcomeComparisonService => new OutcomeComparisonService(prototypes, playtests),
    },
    {
      provide: MOODBOARD_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): MoodboardRepository =>
        new DrizzleMoodboardRepository(client.db),
    },
    {
      provide: MoodboardService,
      inject: [
        MOODBOARD_REPOSITORY,
        EntityService,
        ASSET_REPOSITORY,
        EntityRelationshipService,
        DOMAIN_DEPS,
      ],
      useFactory: (
        boards: MoodboardRepository,
        entities: EntityService,
        assets: AssetRepository,
        relationships: EntityRelationshipService,
        deps: EntityServiceDeps,
      ): MoodboardService => new MoodboardService(boards, entities, assets, relationships, deps),
    },
    {
      provide: JOB_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): JobRepository => new DrizzleJobRepository(client.db),
    },
    {
      provide: JobService,
      inject: [JOB_REPOSITORY, PROJECT_REPOSITORY, JOB_QUEUE, JOB_EVENTS, DOMAIN_DEPS],
      useFactory: (
        jobs: JobRepository,
        projects: ProjectRepository,
        queue: JobQueue,
        events: JobEvents,
        deps: EntityServiceDeps,
      ): JobService => new JobService(jobs, projects, queue, events, deps),
    },
    {
      provide: SEARCH_DOCUMENT_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): SearchDocumentRepository =>
        new DrizzleSearchDocumentRepository(client.db),
    },
    {
      provide: SearchIndexService,
      inject: [
        SEARCH_DOCUMENT_REPOSITORY,
        ENTITY_REPOSITORY,
        ASSET_REPOSITORY,
        GENERATION_REPOSITORY,
        EMBEDDING_PROVIDER,
        JobService,
        DOMAIN_DEPS,
      ],
      useFactory: (
        documents: SearchDocumentRepository,
        entities: EntityRepository,
        assets: AssetRepository,
        generations: GenerationRepository,
        embeddings: EmbeddingProvider,
        jobs: JobService,
        deps: EntityServiceDeps,
      ): SearchIndexService =>
        new SearchIndexService(documents, entities, assets, generations, embeddings, jobs, deps),
    },
    {
      provide: SearchService,
      inject: [SEARCH_DOCUMENT_REPOSITORY, EMBEDDING_PROVIDER],
      useFactory: (
        documents: SearchDocumentRepository,
        embeddings: EmbeddingProvider,
      ): SearchService => new SearchService(documents, embeddings),
    },
    {
      provide: FINDING_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): FindingRepository =>
        new DrizzleFindingRepository(client.db),
    },
    {
      provide: FindingService,
      inject: [FINDING_REPOSITORY, DOMAIN_DEPS],
      useFactory: (findings: FindingRepository, deps: EntityServiceDeps): FindingService =>
        new FindingService(findings, deps),
    },
    {
      provide: ConsistencyScanService,
      inject: [
        ENTITY_REPOSITORY,
        PROTOTYPE_VERSION_REPOSITORY,
        FINDING_REPOSITORY,
        JobService,
        DOMAIN_DEPS,
      ],
      useFactory: (
        entities: EntityRepository,
        prototypeVersions: PrototypeVersionRepository,
        findings: FindingRepository,
        jobs: JobService,
        deps: EntityServiceDeps,
      ): ConsistencyScanService =>
        new ConsistencyScanService(entities, prototypeVersions, findings, jobs, deps),
    },
    {
      provide: COMMENT_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): CommentRepository =>
        new DrizzleCommentRepository(client.db),
    },
    {
      provide: REVIEW_DECISION_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): ReviewDecisionRepository =>
        new DrizzleReviewDecisionRepository(client.db),
    },
    {
      provide: ReviewTargetResolver,
      inject: [
        ENTITY_REPOSITORY,
        ASSET_REPOSITORY,
        PROTOTYPE_VERSION_REPOSITORY,
        VERSION_REPOSITORY,
      ],
      useFactory: (
        entities: EntityRepository,
        assets: AssetRepository,
        prototypeVersions: PrototypeVersionRepository,
        versions: EntityVersionRepository,
      ): ReviewTargetResolver =>
        new ReviewTargetResolver(entities, assets, prototypeVersions, versions),
    },
    {
      provide: CommentService,
      inject: [COMMENT_REPOSITORY, ReviewTargetResolver, DOMAIN_DEPS],
      useFactory: (
        comments: CommentRepository,
        targets: ReviewTargetResolver,
        deps: EntityServiceDeps,
      ): CommentService => new CommentService(comments, targets, deps),
    },
    {
      provide: ReviewService,
      inject: [REVIEW_DECISION_REPOSITORY, ReviewTargetResolver, DOMAIN_DEPS],
      useFactory: (
        decisions: ReviewDecisionRepository,
        targets: ReviewTargetResolver,
        deps: EntityServiceDeps,
      ): ReviewService => new ReviewService(decisions, targets, deps),
    },
    {
      provide: ASSET_SELECTION_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): AssetSelectionRepository =>
        new DrizzleAssetSelectionRepository(client.db),
    },
    {
      provide: ASSET_MARK_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): AssetMarkRepository =>
        new DrizzleAssetMarkRepository(client.db),
    },
    {
      provide: AssetSelectionService,
      inject: [
        ASSET_SELECTION_REPOSITORY,
        ASSET_MARK_REPOSITORY,
        ReviewTargetResolver,
        DOMAIN_DEPS,
      ],
      useFactory: (
        selections: AssetSelectionRepository,
        marks: AssetMarkRepository,
        targets: ReviewTargetResolver,
        deps: EntityServiceDeps,
      ): AssetSelectionService => new AssetSelectionService(selections, marks, targets, deps),
    },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
  exports: [
    ProjectService,
    EntityService,
    EntityRelationshipService,
    EntityVersionService,
    DocumentService,
    LineageService,
    AssetService,
    AssetLibraryService,
    AssetCollectionService,
    GenerationService,
    PrototypeService,
    PlaytestService,
    OutcomeComparisonService,
    MoodboardService,
    JobService,
    ActivityService,
    SearchService,
    SearchIndexService,
    FindingService,
    ConsistencyScanService,
    CommentService,
    ReviewService,
    ReviewTargetResolver,
    AssetSelectionService,
    PROJECT_REPOSITORY,
    ENTITY_REPOSITORY,
    RELATIONSHIP_REPOSITORY,
    VERSION_REPOSITORY,
    ASSET_REPOSITORY,
    ASSET_LIBRARY_READ_MODEL,
    GENERATION_REPOSITORY,
    PROTOTYPE_VERSION_REPOSITORY,
    PLAYTEST_REPOSITORY,
    MOODBOARD_REPOSITORY,
    JOB_REPOSITORY,
    ACTIVITY_REPOSITORY,
    SEARCH_DOCUMENT_REPOSITORY,
    FINDING_REPOSITORY,
    COMMENT_REPOSITORY,
    REVIEW_DECISION_REPOSITORY,
    ASSET_SELECTION_REPOSITORY,
    ASSET_MARK_REPOSITORY,
    DOMAIN_DEPS,
  ],
})
export class DomainModule {}
