import {
  PlaytestService,
  type Playtest,
  type PlaytestFeedback,
  type PlaytestMetric,
  type PlaytestObservation,
  type PlaytestPage,
  type PlaytestSession,
} from '@level-zero/domain';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import {
  CreatePlaytestDto,
  ListPlaytestsQueryDto,
  RecordPlaytestFeedbackDto,
  RecordPlaytestMetricDto,
  RecordPlaytestObservationDto,
  RecordPlaytestSessionDto,
  UpdatePlaytestDto,
} from './dto/playtest.dto';

/**
 * Playtests: evidence about one exact prototype version, never the version
 * itself.
 *
 * A playtest pins a `prototypeVersionId` at creation and never rewrites it;
 * sessions, observations, feedback and metrics are recorded underneath it and
 * have no life of their own, so they are reached through this same
 * controller rather than a module apiece
 * (`docs/decisions/playtest-record-model.md` §3-5).
 */
@Controller('projects/:projectId/playtests')
export class PlaytestsController {
  constructor(private readonly playtests: PlaytestService) {}

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() body: CreatePlaytestDto,
  ): Promise<Playtest> {
    return this.playtests.create(projectId, body);
  }

  /** Scoped by project; optionally narrowed to one prototype version or tag set. */
  @Get()
  list(
    @Param('projectId') projectId: string,
    @Query() query: ListPlaytestsQueryDto,
  ): Promise<PlaytestPage> {
    return this.playtests.list(projectId, {
      tags: query.tag,
      prototypeVersionId: query.prototypeVersionId,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(':playtestId')
  get(
    @Param('projectId') projectId: string,
    @Param('playtestId') playtestId: string,
  ): Promise<Playtest> {
    return this.playtests.getById(projectId, playtestId);
  }

  /** The tested version is never rewritten — only these fields can change. */
  @Patch(':playtestId')
  update(
    @Param('projectId') projectId: string,
    @Param('playtestId') playtestId: string,
    @Body() body: UpdatePlaytestDto,
  ): Promise<Playtest> {
    return this.playtests.update(projectId, playtestId, body);
  }

  /** Numbers the session monotonically within the playtest, starting at 1. */
  @Post(':playtestId/sessions')
  recordSession(
    @Param('projectId') projectId: string,
    @Param('playtestId') playtestId: string,
    @Body() body: RecordPlaytestSessionDto,
  ): Promise<PlaytestSession> {
    return this.playtests.recordSession(projectId, playtestId, body);
  }

  @Get(':playtestId/sessions')
  listSessions(
    @Param('projectId') projectId: string,
    @Param('playtestId') playtestId: string,
  ): Promise<PlaytestSession[]> {
    return this.playtests.listSessions(projectId, playtestId);
  }

  /** What the team noticed. `sessionId` and `entityId`, when given, must belong to this project. */
  @Post(':playtestId/observations')
  recordObservation(
    @Param('projectId') projectId: string,
    @Param('playtestId') playtestId: string,
    @Body() body: RecordPlaytestObservationDto,
  ): Promise<PlaytestObservation> {
    return this.playtests.recordObservation(projectId, playtestId, body);
  }

  @Get(':playtestId/observations')
  listObservations(
    @Param('projectId') projectId: string,
    @Param('playtestId') playtestId: string,
  ): Promise<PlaytestObservation[]> {
    return this.playtests.listObservations(projectId, playtestId);
  }

  /** A participant's own words, stored verbatim. */
  @Post(':playtestId/feedback')
  recordFeedback(
    @Param('projectId') projectId: string,
    @Param('playtestId') playtestId: string,
    @Body() body: RecordPlaytestFeedbackDto,
  ): Promise<PlaytestFeedback> {
    return this.playtests.recordFeedback(projectId, playtestId, body);
  }

  @Get(':playtestId/feedback')
  listFeedback(
    @Param('projectId') projectId: string,
    @Param('playtestId') playtestId: string,
  ): Promise<PlaytestFeedback[]> {
    return this.playtests.listFeedback(projectId, playtestId);
  }

  /** A label matching an existing metric on this playtest reuses its key. */
  @Post(':playtestId/metrics')
  recordMetric(
    @Param('projectId') projectId: string,
    @Param('playtestId') playtestId: string,
    @Body() body: RecordPlaytestMetricDto,
  ): Promise<PlaytestMetric> {
    return this.playtests.recordMetric(projectId, playtestId, body);
  }

  @Get(':playtestId/metrics')
  listMetrics(
    @Param('projectId') projectId: string,
    @Param('playtestId') playtestId: string,
  ): Promise<PlaytestMetric[]> {
    return this.playtests.listMetrics(projectId, playtestId);
  }
}
