import {
  OutcomeComparisonService,
  PrototypeService,
  type OutcomeComparison,
  type PrototypeContents,
  type PrototypeCreation,
  type PrototypeVersion,
  type PrototypeVersionComparison,
  type PrototypeVersionPage,
} from '@level-zero/domain';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import {
  AnnotatePrototypeVersionDto,
  CapturePrototypeVersionDto,
  ComparePrototypeVersionsQueryDto,
  CreatePrototypeDto,
  ListPrototypeVersionsQueryDto,
} from './dto/prototype.dto';

/**
 * Prototypes: playable experiments recorded against the exact creative
 * versions they represent.
 *
 * The prototype itself is an ordinary `prototype` entity, so it is read and
 * edited through the entities endpoints. What lives here is its version
 * history — each capture pins the entity versions going into it, so v1 keeps
 * resolving to what was actually played after the entities have moved on.
 */
@Controller('projects/:projectId/prototypes')
export class PrototypesController {
  constructor(
    private readonly prototypes: PrototypeService,
    private readonly outcomeComparisons: OutcomeComparisonService,
  ) {}

  /** Creates the prototype entity and captures its first version. */
  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() body: CreatePrototypeDto,
  ): Promise<PrototypeCreation> {
    return this.prototypes.create(projectId, body);
  }

  /** Captures a new version from the entities given. */
  @Post(':prototypeId/versions')
  capture(
    @Param('projectId') projectId: string,
    @Param('prototypeId') prototypeId: string,
    @Body() body: CapturePrototypeVersionDto,
  ): Promise<PrototypeVersion> {
    return this.prototypes.capture(projectId, prototypeId, body);
  }

  @Get(':prototypeId/versions')
  list(
    @Param('projectId') projectId: string,
    @Param('prototypeId') prototypeId: string,
    @Query() query: ListPrototypeVersionsQueryDto,
  ): Promise<PrototypeVersionPage> {
    return this.prototypes.list(projectId, prototypeId, query);
  }

  /**
   * Which entity versions were added, removed or changed between two versions.
   *
   * Declared before `:prototypeVersionId` so the literal path wins: Nest
   * matches routes in declaration order.
   */
  @Get(':prototypeId/versions/compare')
  compare(
    @Param('projectId') projectId: string,
    @Query() query: ComparePrototypeVersionsQueryDto,
  ): Promise<PrototypeVersionComparison> {
    return this.prototypes.compare(projectId, query.from, query.to);
  }

  /**
   * The same two versions, read beside what the playtests of each measured.
   *
   * Facts only — pinned versions, tuning values, measured numbers and the
   * words people wrote. A model's reading of them is a separate request.
   */
  @Get(':prototypeId/versions/outcomes')
  outcomes(
    @Param('projectId') projectId: string,
    @Query() query: ComparePrototypeVersionsQueryDto,
  ): Promise<OutcomeComparison> {
    return this.outcomeComparisons.compare(projectId, query.from, query.to);
  }

  @Get(':prototypeId/versions/:prototypeVersionId')
  get(
    @Param('projectId') projectId: string,
    @Param('prototypeVersionId') prototypeVersionId: string,
  ): Promise<PrototypeVersion> {
    return this.prototypes.getById(projectId, prototypeVersionId);
  }

  /** The version with its pinned entity versions and build artifact resolved. */
  @Get(':prototypeId/versions/:prototypeVersionId/contents')
  contents(
    @Param('projectId') projectId: string,
    @Param('prototypeVersionId') prototypeVersionId: string,
  ): Promise<PrototypeContents> {
    return this.prototypes.contents(projectId, prototypeVersionId);
  }

  /** Updates status, notes or the build artifact. The pins never change. */
  @Patch(':prototypeId/versions/:prototypeVersionId')
  annotate(
    @Param('projectId') projectId: string,
    @Param('prototypeVersionId') prototypeVersionId: string,
    @Body() body: AnnotatePrototypeVersionDto,
  ): Promise<PrototypeVersion> {
    return this.prototypes.annotate(projectId, prototypeVersionId, body);
  }
}
