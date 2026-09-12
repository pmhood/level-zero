import {
  AiProvidersExhaustedError,
  type AiCapability,
  type AiProviderRegistry,
  type AiResult,
  type ResolvedContext,
} from '@level-zero/ai';
import { GenerationService, isDomainError, type Generation } from '@level-zero/domain';
import { BadGatewayException, Inject, Injectable } from '@nestjs/common';

/**
 * Where the registered AI providers live, for whatever needs to reach them
 * directly — `InlineAiRequestService` itself, and `InspectorAiController`'s
 * `/capabilities` read, which answers without running a request at all.
 */
export const AI_PROVIDERS = Symbol('AI_PROVIDERS');

/** What a controller owns about one inline AI request. */
export interface InlineAiRequest {
  capability: AiCapability;
  prompt: string;
  /** Provider-agnostic knobs exactly as the endpoint wants them recorded. */
  parameters?: Record<string, unknown>;
  /** The project material assembled for this request, by the caller's own `ContextResolver` call. */
  context: ResolvedContext;
  createdBy?: string;
}

/**
 * The flow behind every inline AI answer: a request a caller is watching a
 * spinner for, as opposed to `/generations`' async, job-shaped path.
 *
 * `DocumentAiController`, `PrototypeOutcomesAiController` and
 * `InspectorAiController` each own what is genuinely per-surface — what they
 * resolve into context, how they build their prompt, and what they return —
 * and hand the rest to `run`: recording the generation before any provider is
 * called, dispatching it to the best candidate, correcting that record if a
 * later candidate actually answered, and completing or failing it depending
 * on how the call went.
 *
 * The redispatch correction and the domain-error-vs-`BadGatewayException`
 * mapping both encode rules that are easy to get subtly wrong, and previously
 * had to be kept in sync by hand across three near-identical files. This is
 * now the one place they live for these three callers. (§160)
 */
@Injectable()
export class InlineAiRequestService {
  constructor(
    private readonly generations: GenerationService,
    @Inject(AI_PROVIDERS) private readonly providers: AiProviderRegistry,
  ) {}

  /**
   * Runs one inline AI request to completion and returns whatever `toResponse`
   * builds from the provider's result.
   *
   * `toResponse` runs before the generation is marked complete, so it can
   * still validate the provider's output — an empty answer, say — and throw;
   * that failure is recorded exactly like a provider throwing outright.
   */
  async run<T>(
    projectId: string,
    request: InlineAiRequest,
    toResponse: (result: AiResult, generation: Generation) => T,
  ): Promise<T> {
    // Fail before anything is recorded if nothing can serve the capability.
    const candidates = this.providers.candidatesFor(request.capability);
    const firstChoice = this.providers.resolve(request.capability);

    const generation = await this.generations.record(projectId, {
      capability: request.capability,
      prompt: request.prompt,
      parameters: request.parameters,
      inputEntityIds: namedEntityIds(request.context),
      contextEntityIds: ambientEntityIds(request.context),
      inputAssetIds: request.context.assets.map((asset) => asset.id),
      resolvedContext: { ...request.context },
      createdBy: request.createdBy,
    });

    await this.generations.dispatch(projectId, generation.id, {
      provider: firstChoice.id,
      model: firstChoice.defaultModel,
    });

    try {
      const result = await this.providers.execute({
        capability: request.capability,
        prompt: request.prompt,
        parameters: generation.parameters,
        context: request.context,
      });

      // `execute` may have fallen through to a later candidate; correct the
      // record so it never names a provider that did not produce the result.
      const actual = candidates.find((candidate) => candidate.id === result.providerId);
      if (actual && actual.id !== firstChoice.id) {
        await this.generations.redispatch(projectId, generation.id, {
          provider: actual.id,
          model: actual.defaultModel,
        });
      }

      const response = toResponse(result, generation);

      await this.generations.complete(projectId, generation.id, {
        outputAssetIds: [],
        providerRequestId: result.requestId ?? null,
      });

      return response;
    } catch (error) {
      // Every candidate was tried and none produced a result: record the
      // whole attempt sequence rather than just the last error, so the
      // generation does not keep naming a provider that never answered.
      await this.generations.fail(projectId, generation.id, {
        ...failure(error),
        attempts: error instanceof AiProvidersExhaustedError ? error.attempts : undefined,
      });
      // A domain failure keeps its own status; anything the provider threw is
      // an upstream problem, not the caller's.
      throw isDomainError(error) ? error : toBadGateway(error);
    }
  }
}

/** Entities the caller pointed at directly. */
function namedEntityIds(context: ResolvedContext): string[] {
  return context.entities
    .filter((entity) => entity.source !== 'related')
    .map((entity) => entity.id);
}

/** Entities the relationship walk brought in around them. */
function ambientEntityIds(context: ResolvedContext): string[] {
  return context.entities
    .filter((entity) => entity.source === 'related')
    .map((entity) => entity.id);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failure(error: unknown): { code: string; message: string } {
  return {
    code: isDomainError(error) ? error.code : 'provider_error',
    message: message(error),
  };
}

function toBadGateway(error: unknown): BadGatewayException {
  return error instanceof BadGatewayException
    ? error
    : new BadGatewayException(`The AI provider could not answer: ${message(error)}`);
}
