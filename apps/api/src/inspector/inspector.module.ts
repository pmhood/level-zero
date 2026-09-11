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
import { InspectorAiController } from './inspector-ai.controller';

/**
 * The contextual AI inspector.
 *
 * Only the controller is new: the orchestration, the context resolution and
 * the generation records all come from `DomainModule` and `AiModule`. The
 * `ContextResolver` is built the same way `GenerationsModule` and
 * `DocumentsModule` build theirs — from the project-scoped ports, so a
 * resolved context can only ever hold one project's material.
 */
@Module({
  controllers: [InspectorAiController],
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
export class InspectorModule {}
