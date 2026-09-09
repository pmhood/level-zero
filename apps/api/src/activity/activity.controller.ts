import { ActivityService, type ActivityPage } from '@level-zero/domain';
import { Controller, Get, Param, Query } from '@nestjs/common';

import { ListActivityQueryDto } from './dto/activity.dto';

/**
 * The project activity feed (design spec section 63): meaningful entity,
 * version, generation and prototype changes, newest first.
 *
 * Nothing here writes an entry — the domain services that already decide
 * whether a change is meaningful record through `ActivityService` as a side
 * effect of the change itself. This controller only reads the feed back,
 * scoped to a project and optionally to one subject for a contextual
 * workspace view.
 */
@Controller('projects/:projectId/activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list(
    @Param('projectId') projectId: string,
    @Query() query: ListActivityQueryDto,
  ): Promise<ActivityPage> {
    return this.activity.listByProject(projectId, {
      types: query.type,
      subjectId: query.subjectId,
      limit: query.limit,
      offset: query.offset,
    });
  }
}
