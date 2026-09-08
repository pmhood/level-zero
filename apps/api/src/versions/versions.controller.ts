import {
  EntityVersionService,
  type EntityHistory,
  type EntityVersion,
  type VersionComparison,
} from '@level-zero/domain';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import {
  BranchVersionDto,
  CommitVersionDto,
  CompareVersionsQueryDto,
  ListVersionsQueryDto,
  PromoteVersionDto,
  RestoreVersionDto,
} from './dto/version.dto';

/**
 * Meaningful creative history for an entity.
 *
 * Editing an entity does not create a version; committing does. Restore, branch
 * and promote all append, so no operation here can remove history.
 */
@Controller('projects/:projectId/entities/:entityId/versions')
export class VersionsController {
  constructor(private readonly versions: EntityVersionService) {}

  /** Records the entity's current content as a version. */
  @Post()
  commit(
    @Param('projectId') projectId: string,
    @Param('entityId') entityId: string,
    @Body() body: CommitVersionDto,
  ): Promise<EntityVersion> {
    return this.versions.commit(projectId, entityId, body);
  }

  /** Versions, branches and the current version: enough to draw the graph. */
  @Get()
  history(
    @Param('projectId') projectId: string,
    @Param('entityId') entityId: string,
    @Query() query: ListVersionsQueryDto,
  ): Promise<EntityHistory> {
    return this.versions.history(projectId, entityId, {
      branchName: query.branch,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /**
   * Declared before `:versionId` so the literal path wins: Nest matches routes
   * in declaration order and `compare` would otherwise read as a version id.
   */
  @Get('compare')
  compare(
    @Param('projectId') projectId: string,
    @Query() query: CompareVersionsQueryDto,
  ): Promise<VersionComparison> {
    return this.versions.compare(projectId, query.from, query.to);
  }

  @Get(':versionId')
  get(
    @Param('projectId') projectId: string,
    @Param('versionId') versionId: string,
  ): Promise<EntityVersion> {
    return this.versions.getById(projectId, versionId);
  }

  /** Re-applies this version, as a new version. Later history is kept. */
  @Post(':versionId/restore')
  restore(
    @Param('projectId') projectId: string,
    @Param('versionId') versionId: string,
    @Body() body: RestoreVersionDto,
  ): Promise<EntityVersion> {
    return this.versions.restoreVersion(projectId, versionId, body);
  }

  /** Starts an independent line of work from this version. */
  @Post(':versionId/branch')
  branch(
    @Param('projectId') projectId: string,
    @Param('versionId') versionId: string,
    @Body() body: BranchVersionDto,
  ): Promise<EntityVersion> {
    return this.versions.branch(projectId, versionId, body);
  }

  /** Brings this version's content onto another branch, `main` by default. */
  @Post(':versionId/promote')
  promote(
    @Param('projectId') projectId: string,
    @Param('versionId') versionId: string,
    @Body() body: PromoteVersionDto,
  ): Promise<EntityVersion> {
    return this.versions.promote(projectId, versionId, body);
  }
}
