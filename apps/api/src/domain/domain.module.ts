import {
  DrizzleActivityRepository,
  DrizzleAssetRepository,
  DrizzleEntityRelationshipRepository,
  DrizzleEntityRepository,
  DrizzleEntityVersionRepository,
  DrizzleGenerationRepository,
  DrizzleJobRepository,
  DrizzleProjectRepository,
  DrizzlePrototypeVersionRepository,
  type DatabaseClient,
} from '@level-zero/database';
import {
  ActivityService,
  AssetService,
  DocumentService,
  EntityRelationshipService,
  EntityService,
  EntityVersionService,
  GenerationService,
  JobService,
  LineageService,
  ProjectService,
  PrototypeService,
  systemClock,
  uuidIdGenerator,
  type ActivityRepository,
  type AssetRepository,
  type EntityRelationshipRepository,
  type EntityRepository,
  type EntityVersionRepository,
  type EntityServiceDeps,
  type GenerationRepository,
  type JobEvents,
  type JobQueue,
  type JobRepository,
  type ObjectStorageProvider,
  type ProjectRepository,
  type PrototypeVersionRepository,
} from '@level-zero/domain';
import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { DATABASE_CLIENT } from '../infrastructure/database.module';
import { JOB_EVENTS, JOB_QUEUE } from '../infrastructure/queue.module';
import { OBJECT_STORAGE } from '../infrastructure/storage.module';

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');
export const ENTITY_REPOSITORY = Symbol('ENTITY_REPOSITORY');
export const ACTIVITY_REPOSITORY = Symbol('ACTIVITY_REPOSITORY');
export const RELATIONSHIP_REPOSITORY = Symbol('RELATIONSHIP_REPOSITORY');
export const VERSION_REPOSITORY = Symbol('VERSION_REPOSITORY');
export const ASSET_REPOSITORY = Symbol('ASSET_REPOSITORY');
export const GENERATION_REPOSITORY = Symbol('GENERATION_REPOSITORY');
export const PROTOTYPE_VERSION_REPOSITORY = Symbol('PROTOTYPE_VERSION_REPOSITORY');
export const JOB_REPOSITORY = Symbol('JOB_REPOSITORY');
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
      inject: [ENTITY_REPOSITORY, PROJECT_REPOSITORY, ActivityService, DOMAIN_DEPS],
      useFactory: (
        entities: EntityRepository,
        projects: ProjectRepository,
        activity: ActivityService,
        deps: EntityServiceDeps,
      ): EntityService => new EntityService(entities, projects, activity, deps),
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
      inject: [VERSION_REPOSITORY, ENTITY_REPOSITORY, ActivityService, DOMAIN_DEPS],
      useFactory: (
        versions: EntityVersionRepository,
        entities: EntityRepository,
        activity: ActivityService,
        deps: EntityServiceDeps,
      ): EntityVersionService => new EntityVersionService(versions, entities, activity, deps),
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
      inject: [ASSET_REPOSITORY, PROJECT_REPOSITORY, OBJECT_STORAGE, DOMAIN_DEPS],
      useFactory: (
        assets: AssetRepository,
        projects: ProjectRepository,
        storage: ObjectStorageProvider,
        deps: EntityServiceDeps,
      ): AssetService => new AssetService(assets, projects, storage, deps),
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
      ],
      useFactory: (
        generations: GenerationRepository,
        projects: ProjectRepository,
        entities: EntityRepository,
        assets: AssetRepository,
        lineage: LineageService,
        activity: ActivityService,
        deps: EntityServiceDeps,
      ): GenerationService =>
        new GenerationService(generations, projects, entities, assets, lineage, activity, deps),
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
        DOMAIN_DEPS,
      ],
      useFactory: (
        prototypeVersions: PrototypeVersionRepository,
        entities: EntityService,
        versions: EntityVersionRepository,
        assets: AssetRepository,
        activity: ActivityService,
        deps: EntityServiceDeps,
      ): PrototypeService =>
        new PrototypeService(prototypeVersions, entities, versions, assets, activity, deps),
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
    GenerationService,
    PrototypeService,
    JobService,
    ActivityService,
    PROJECT_REPOSITORY,
    ENTITY_REPOSITORY,
    RELATIONSHIP_REPOSITORY,
    VERSION_REPOSITORY,
    ASSET_REPOSITORY,
    GENERATION_REPOSITORY,
    PROTOTYPE_VERSION_REPOSITORY,
    JOB_REPOSITORY,
    ACTIVITY_REPOSITORY,
    DOMAIN_DEPS,
  ],
})
export class DomainModule {}
