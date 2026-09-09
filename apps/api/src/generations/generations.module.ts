import { ContextResolver } from '@level-zero/ai';
import {
  type AssetRepository,
  type EntityRelationshipRepository,
  type EntityRepository,
  type GenerationRepository,
  type ProjectRepository,
} from '@level-zero/domain';
import { Module } from '@nestjs/common';

import {
  ASSET_REPOSITORY,
  ENTITY_REPOSITORY,
  GENERATION_REPOSITORY,
  PROJECT_REPOSITORY,
  RELATIONSHIP_REPOSITORY,
} from '../domain/domain.module';
import { GenerationsController } from './generations.controller';

/**
 * `ContextResolver` is wired here rather than in `DomainModule` because it is
 * the provider layer's, not the domain's — it reads the same project-scoped
 * ports, and assembling a prompt's context is what the generations feature
 * needs it for.
 */
@Module({
  controllers: [GenerationsController],
  providers: [
    {
      provide: ContextResolver,
      inject: [
        PROJECT_REPOSITORY,
        ENTITY_REPOSITORY,
        RELATIONSHIP_REPOSITORY,
        ASSET_REPOSITORY,
        GENERATION_REPOSITORY,
      ],
      useFactory: (
        projects: ProjectRepository,
        entities: EntityRepository,
        relationships: EntityRelationshipRepository,
        assets: AssetRepository,
        generations: GenerationRepository,
      ): ContextResolver =>
        new ContextResolver(projects, entities, relationships, assets, generations),
    },
  ],
})
export class GenerationsModule {}
