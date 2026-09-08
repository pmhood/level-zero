import {
  DrizzleEntityRepository,
  DrizzleProjectRepository,
  type DatabaseClient,
} from '@level-zero/database';
import {
  EntityService,
  ProjectService,
  systemClock,
  uuidIdGenerator,
  type EntityRepository,
  type EntityServiceDeps,
  type ProjectRepository,
} from '@level-zero/domain';
import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { DATABASE_CLIENT } from '../infrastructure/database.module';

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');
export const ENTITY_REPOSITORY = Symbol('ENTITY_REPOSITORY');
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
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
  exports: [ProjectService, EntityService, PROJECT_REPOSITORY, ENTITY_REPOSITORY, DOMAIN_DEPS],
})
export class DomainModule {}
