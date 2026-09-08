import { ProjectService, type Project, type ProjectPage } from '@level-zero/domain';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { CreateProjectDto, ListProjectsQueryDto, UpdateProjectDto } from './dto/project.dto';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectService) {}

  @Post()
  create(@Body() body: CreateProjectDto): Promise<Project> {
    return this.projects.create(body);
  }

  @Get()
  list(@Query() query: ListProjectsQueryDto): Promise<ProjectPage> {
    return this.projects.list({
      statuses: query.status,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(':projectId')
  get(@Param('projectId') projectId: string): Promise<Project> {
    return this.projects.getById(projectId);
  }

  @Patch(':projectId')
  update(@Param('projectId') projectId: string, @Body() body: UpdateProjectDto): Promise<Project> {
    return this.projects.update(projectId, body);
  }

  /**
   * Archiving is a state change, not a deletion: entities, relationships and
   * lineage that point at the project stay intact.
   */
  @Post(':projectId/archive')
  archive(@Param('projectId') projectId: string): Promise<Project> {
    return this.projects.archive(projectId);
  }

  @Post(':projectId/restore')
  restore(@Param('projectId') projectId: string): Promise<Project> {
    return this.projects.restore(projectId);
  }
}
