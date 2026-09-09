import {
  GenerationService,
  type Generation,
  type GenerationPage,
  type GenerationProvenance,
} from '@level-zero/domain';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import {
  CompleteGenerationDto,
  CreateGenerationDto,
  DispatchGenerationDto,
  FailGenerationDto,
  ListGenerationsQueryDto,
} from './dto/generation.dto';

/**
 * Generation records: what was asked of an AI, who answered, and what came out.
 *
 * The record is created before provider work is dispatched, then moved forward
 * through `/dispatch`, `/complete`, `/fail` and `/cancel`. Nothing here
 * rewrites a request, so a failure keeps its diagnostics *and* the prompt that
 * produced it.
 *
 * Reading provenance backwards — "how was this image made?" — is a listing
 * filtered by `outputAssetId` (or `entityId` for the entities that influenced
 * one), and `/provenance` resolves a record's ids to the entities, assets and
 * parent generation they name.
 */
@Controller('projects/:projectId/generations')
export class GenerationsController {
  constructor(private readonly generations: GenerationService) {}

  @Post()
  record(
    @Param('projectId') projectId: string,
    @Body() body: CreateGenerationDto,
  ): Promise<Generation> {
    return this.generations.record(projectId, body);
  }

  @Get()
  list(
    @Param('projectId') projectId: string,
    @Query() query: ListGenerationsQueryDto,
  ): Promise<GenerationPage> {
    return this.generations.listByProject(projectId, {
      statuses: query.status,
      capability: query.capability,
      parentGenerationId: query.parentGenerationId,
      outputAssetId: query.outputAssetId,
      entityId: query.entityId,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(':generationId')
  get(
    @Param('projectId') projectId: string,
    @Param('generationId') generationId: string,
  ): Promise<Generation> {
    return this.generations.getById(projectId, generationId);
  }

  /** The record with its inputs, project context, outputs and parent resolved. */
  @Get(':generationId/provenance')
  provenance(
    @Param('projectId') projectId: string,
    @Param('generationId') generationId: string,
  ): Promise<GenerationProvenance> {
    return this.generations.provenance(projectId, generationId);
  }

  /** Provider work has started: records who is doing it and with which model. */
  @Post(':generationId/dispatch')
  dispatch(
    @Param('projectId') projectId: string,
    @Param('generationId') generationId: string,
    @Body() body: DispatchGenerationDto,
  ): Promise<Generation> {
    return this.generations.dispatch(projectId, generationId, body);
  }

  @Post(':generationId/complete')
  complete(
    @Param('projectId') projectId: string,
    @Param('generationId') generationId: string,
    @Body() body: CompleteGenerationDto,
  ): Promise<Generation> {
    return this.generations.complete(projectId, generationId, body);
  }

  @Post(':generationId/fail')
  fail(
    @Param('projectId') projectId: string,
    @Param('generationId') generationId: string,
    @Body() body: FailGenerationDto,
  ): Promise<Generation> {
    return this.generations.fail(projectId, generationId, body);
  }

  @Post(':generationId/cancel')
  cancel(
    @Param('projectId') projectId: string,
    @Param('generationId') generationId: string,
  ): Promise<Generation> {
    return this.generations.cancel(projectId, generationId);
  }
}
