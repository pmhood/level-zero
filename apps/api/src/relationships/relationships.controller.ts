import {
  EntityRelationshipService,
  LineageService,
  type EntityNeighborhood,
  type EntityRelationship,
  type PromotionResult,
} from '@level-zero/domain';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';

import {
  CreateRelationshipDto,
  ListRelationshipsQueryDto,
  PromoteEntityDto,
} from './dto/relationship.dto';

/**
 * The relationship graph around an entity.
 *
 * Relationships are their own rows, so linking a character to a faction, a
 * location or an asset reference never copies or takes ownership of them.
 */
@Controller('projects/:projectId/entities/:entityId')
export class RelationshipsController {
  constructor(
    private readonly relationships: EntityRelationshipService,
    private readonly lineage: LineageService,
  ) {}

  @Post('relationships')
  link(
    @Param('projectId') projectId: string,
    @Param('entityId') entityId: string,
    @Body() body: CreateRelationshipDto,
  ): Promise<EntityRelationship> {
    return this.relationships.link(projectId, { ...body, sourceEntityId: entityId });
  }

  /** The entity's immediate neighbourhood: every edge one hop away, resolved. */
  @Get('relationships')
  graph(
    @Param('projectId') projectId: string,
    @Param('entityId') entityId: string,
    @Query() query: ListRelationshipsQueryDto,
  ): Promise<EntityNeighborhood> {
    return this.relationships.neighborhood(projectId, entityId, {
      direction: query.direction,
      relations: query.relation,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /** Removes a structural link. Lineage relations are refused with a 409. */
  @Delete('relationships/:relationshipId')
  @HttpCode(204)
  async unlink(
    @Param('projectId') projectId: string,
    @Param('relationshipId') relationshipId: string,
  ): Promise<void> {
    await this.relationships.unlink(projectId, relationshipId);
  }

  /**
   * Promotes the entity into a new one of another type, recording the lineage.
   * The source is preserved: a promoted idea is still an idea.
   */
  @Post('promote')
  promote(
    @Param('projectId') projectId: string,
    @Param('entityId') entityId: string,
    @Body() body: PromoteEntityDto,
  ): Promise<PromotionResult> {
    return this.lineage.promote(projectId, entityId, body);
  }
}
