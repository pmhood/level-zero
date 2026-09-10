import { EntityService, type Entity, type EntityPage } from '@level-zero/domain';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import {
  CreateEntityDto,
  FindOrCreateAssetReferenceDto,
  ListEntitiesQueryDto,
  UpdateEntityDto,
} from './dto/entity.dto';

/**
 * Entities are addressed under their project, so scoping is part of the URL
 * rather than something a caller may forget to pass.
 *
 * Every Workbench tool uses these endpoints. A feature must not add its own
 * endpoints backed by its own table for the same objects.
 */
@Controller('projects/:projectId/entities')
export class EntitiesController {
  constructor(private readonly entities: EntityService) {}

  @Post()
  create(@Param('projectId') projectId: string, @Body() body: CreateEntityDto): Promise<Entity> {
    return this.entities.create(projectId, body);
  }

  /**
   * The `asset_reference` entity for `body.assetId`, reused if one already
   * exists (active or archived) rather than duplicated. Resolved server-side
   * as one atomic lookup-or-insert — see `EntityService.findOrCreateAssetReference`
   * — so it stays correct no matter how many references a project has.
   */
  @Post('asset-references/find-or-create')
  findOrCreateAssetReference(
    @Param('projectId') projectId: string,
    @Body() body: FindOrCreateAssetReferenceDto,
  ): Promise<Entity> {
    return this.entities.findOrCreateAssetReference(projectId, body.assetId, { name: body.name });
  }

  @Get()
  list(
    @Param('projectId') projectId: string,
    @Query() query: ListEntitiesQueryDto,
  ): Promise<EntityPage> {
    return this.entities.listByProject(projectId, {
      types: query.type,
      statuses: query.status,
      tags: query.tag,
      search: query.search,
      includeArchived: query.includeArchived,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(':entityId')
  get(@Param('projectId') projectId: string, @Param('entityId') entityId: string): Promise<Entity> {
    return this.entities.getById(projectId, entityId);
  }

  @Patch(':entityId')
  update(
    @Param('projectId') projectId: string,
    @Param('entityId') entityId: string,
    @Body() body: UpdateEntityDto,
  ): Promise<Entity> {
    return this.entities.update(projectId, entityId, body);
  }

  @Post(':entityId/archive')
  archive(
    @Param('projectId') projectId: string,
    @Param('entityId') entityId: string,
  ): Promise<Entity> {
    return this.entities.archive(projectId, entityId);
  }

  @Post(':entityId/restore')
  restore(
    @Param('projectId') projectId: string,
    @Param('entityId') entityId: string,
  ): Promise<Entity> {
    return this.entities.restore(projectId, entityId);
  }
}
