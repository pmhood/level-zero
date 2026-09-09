import { ContextResolver, type ResolvedContext } from '@level-zero/ai';
import {
  GENERATION_JOB_STEPS,
  GenerationService,
  JobService,
  type Generation,
  type GenerationPage,
  type GenerationProvenance,
  type RecordGenerationInput,
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
 * `POST` returns as soon as the request is recorded and queued: the provider
 * call happens in the worker process, and the states after `queued` are written
 * by whichever process is doing the work. `/dispatch`, `/complete` and `/fail`
 * remain open for a caller that runs its own generation.
 *
 * A request may name its inputs itself, or send a `context` block describing
 * what the user pointed at and let `ContextResolver` assemble it. Either way
 * the record ends up carrying the ids that went in, and a resolved context is
 * stored alongside them so provenance can say why each one was included.
 *
 * Reading provenance backwards — "how was this image made?" — is a listing
 * filtered by `outputAssetId` (or `entityId` for the entities that influenced
 * one), and `/provenance` resolves a record's ids to the entities, assets and
 * parent generation they name.
 */
@Controller('projects/:projectId/generations')
export class GenerationsController {
  constructor(
    private readonly generations: GenerationService,
    private readonly jobs: JobService,
    private readonly context: ContextResolver,
  ) {}

  /**
   * Records the request, queues the work and returns immediately. The response
   * carries the generation id, which is the handle for everything that follows:
   * its job, its progress and its output.
   */
  @Post()
  async record(
    @Param('projectId') projectId: string,
    @Body() body: CreateGenerationDto,
  ): Promise<Generation> {
    const { context, ...request } = body;
    const generation = await this.generations.record(
      projectId,
      context
        ? withResolvedContext(
            request,
            await this.context.resolve(projectId, {
              ...context,
              instruction: request.prompt,
              parentGenerationId: request.parentGenerationId,
            }),
          )
        : request,
    );

    await this.jobs.enqueue(projectId, {
      kind: 'generation',
      targetId: generation.id,
      totalSteps: GENERATION_JOB_STEPS.length,
    });

    return generation;
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

  /**
   * Cancels the generation and the job running it. A worker already inside a
   * provider call stops at its next step, because that call cannot be recalled.
   */
  @Post(':generationId/cancel')
  async cancel(
    @Param('projectId') projectId: string,
    @Param('generationId') generationId: string,
  ): Promise<Generation> {
    const cancelled = await this.generations.cancel(projectId, generationId);
    await this.jobs.cancelForTarget(projectId, 'generation', generationId);
    return cancelled;
  }
}

/**
 * Folds an assembled context into the record's own fields.
 *
 * Entities the user pointed at become named inputs; the ones the relationship
 * walk discovered become ambient project context — the distinction the
 * generation record already draws. Ids the caller supplied itself are kept:
 * `createGeneration` de-duplicates the union.
 */
function withResolvedContext(
  request: Omit<CreateGenerationDto, 'context'>,
  context: ResolvedContext,
): RecordGenerationInput {
  const named = context.entities.filter((entity) => entity.source !== 'related');
  const ambient = context.entities.filter((entity) => entity.source === 'related');

  return {
    ...request,
    inputEntityIds: [...named.map((entity) => entity.id), ...(request.inputEntityIds ?? [])],
    contextEntityIds: [...ambient.map((entity) => entity.id), ...(request.contextEntityIds ?? [])],
    inputAssetIds: [...context.assets.map((asset) => asset.id), ...(request.inputAssetIds ?? [])],
    resolvedContext: { ...context },
  };
}
