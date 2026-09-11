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
import { PrototypeOutcomesAiController } from './prototype-outcomes-ai.controller';
import { PrototypesController } from './prototypes.controller';

/**
 * `ContextResolver` is the provider layer's, not the domain's, so it is wired
 * where a feature needs it — here, so an interpretation of two versions'
 * outcomes arrives carrying the prototype and the entities whose pins moved.
 */
@Module({
  controllers: [PrototypesController, PrototypeOutcomesAiController],
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
export class PrototypesModule {}
