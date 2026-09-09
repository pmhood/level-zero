import {
  DrizzleAssetRepository,
  DrizzleEntityRelationshipRepository,
  DrizzleEntityRepository,
  DrizzleEntityVersionRepository,
  DrizzleGenerationRepository,
  DrizzleProjectRepository,
  DrizzlePrototypeVersionRepository,
  type DatabaseClient,
} from '@level-zero/database';
import {
  AssetService,
  EntityRelationshipService,
  EntityService,
  EntityVersionService,
  GenerationService,
  LineageService,
  ProjectService,
  PrototypeService,
  systemClock,
  uuidIdGenerator,
  type AssetRepository,
  type EntityRelationshipRepository,
  type EntityRepository,
  type EntityVersionRepository,
  type EntityServiceDeps,
  type GenerationRepository,
  type ObjectStorageProvider,
  type ProjectRepository,
  type PrototypeVersionRepository,
} from '@level-zero/domain';
import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { DATABASE_CLIENT } from '../infrastructure/database.module';
import { OBJECT_STORAGE } from '../infrastructure/storage.module';

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');
export const ENTITY_REPOSITORY = Symbol('ENTITY_REPOSITORY');
export const RELATIONSHIP_REPOSITORY = Symbol('RELATIONSHIP_REPOSITORY');
export const VERSION_REPOSITORY = Symbol('VERSION_REPOSITORY');
export const ASSET_REPOSITORY = Symbol('ASSET_REPOSITORY');
export const GENERATION_REPOSITORY = Symbol('GENERATION_REPOSITORY');
export const PROTOTYPE_VERSION_REPOSITORY = Symbol('PROTOTYPE_VERSION_REPOSITORY');
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
      provide: ProjectService,
      inject: [PROJECT_REPOSITORY, DOMAIN_DEPS],
      useFactory: (projects: ProjectRepository, deps: EntityServiceDeps): ProjectService =>
        new ProjectService(projects, deps),
    },
    {
      provide: EntityService,
      inject: [ENTITY_REPOSITORY, PROJECT_REPOSITORY, DOMAIN_DEPS],
      useFactory: (
        entities: EntityRepository,
        projects: ProjectRepository,
        deps: EntityServiceDeps,
      ): EntityService => new EntityService(entities, projects, deps),
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
      inject: [EntityService, EntityRelationshipService],
      useFactory: (
        entities: EntityService,
        relationships: EntityRelationshipService,
      ): LineageService => new LineageService(entities, relationships),
    },
    {
      provide: VERSION_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (client: DatabaseClient): EntityVersionRepository =>
        new DrizzleEntityVersionRepository(client.db),
    },
    {
      provide: EntityVersionService,
      inject: [VERSION_REPOSITORY, ENTITY_REPOSITORY, DOMAIN_DEPS],
      useFactory: (
        versions: EntityVersionRepository,
        entities: EntityRepository,
        deps: EntityServiceDeps,
      ): EntityVersionService => new EntityVersionService(versions, entities, deps),
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
        DOMAIN_DEPS,
      ],
      useFactory: (
        generations: GenerationRepository,
        projects: ProjectRepository,
        entities: EntityRepository,
        assets: AssetRepository,
        lineage: LineageService,
        deps: EntityServiceDeps,
      ): GenerationService =>
        new GenerationService(generations, projects, entities, assets, lineage, deps),
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
        DOMAIN_DEPS,
      ],
      useFactory: (
        prototypeVersions: PrototypeVersionRepository,
        entities: EntityService,
        versions: EntityVersionRepository,
        assets: AssetRepository,
        deps: EntityServiceDeps,
      ): PrototypeService =>
        new PrototypeService(prototypeVersions, entities, versions, assets, deps),
    },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
  exports: [
    ProjectService,
    EntityService,
    EntityRelationshipService,
    EntityVersionService,
    LineageService,
    AssetService,
    GenerationService,
    PrototypeService,
    PROJECT_REPOSITORY,
    ENTITY_REPOSITORY,
    RELATIONSHIP_REPOSITORY,
    VERSION_REPOSITORY,
    ASSET_REPOSITORY,
    GENERATION_REPOSITORY,
    PROTOTYPE_VERSION_REPOSITORY,
    DOMAIN_DEPS,
  ],
})
export class DomainModule {}
