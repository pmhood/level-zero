import {
  NotFoundError,
  type AiCheckCandidate,
  type AiCheckContext,
  type AiJudgement,
  type AiJudgementRequest,
  type AiRetrievalRequest,
  type GenerationService,
  type SearchService,
} from '@level-zero/domain';

import { type ContextResolver } from './context-resolver';
import { type AiProviderRegistry } from './registry';

/** Who a scan's generations are attributed to until authentication lands. */
export const CONSISTENCY_SCAN_ACTOR = 'consistency-scan';

/** Nearest neighbours a retrieval returns when the caller does not say. */
const DEFAULT_RETRIEVAL_LIMIT = 3;

export interface ProviderAiCheckContextDeps {
  contexts: ContextResolver;
  providers: AiProviderRegistry;
  generations: GenerationService;
  search: SearchService;
}

/**
 * The `AiCheckContext` an AI consistency check actually runs against: the
 * project's search index for proposing, and a `text.generate` provider for
 * deciding.
 *
 * Bound to one project at construction, which is what makes "a finding must
 * never cite two projects" structural on this side too — a check holds no
 * project id it could pass, and every call below reaches storage through the
 * same project-scoped ports every other read here uses.
 *
 * Every judgement is one `Generation`, reused unchanged (§9): the prompt, the
 * provider, the model, the entities that entered context and the context
 * exactly as it was sent are all on that row, so a finding can be explained
 * afterwards without a second provenance mechanism. `outputAssetIds` stays
 * empty — the judgement's result is the finding, not a file. Retrieval writes
 * no `Generation` of its own, because retrieval is not the finding.
 */
export class ProviderAiCheckContext implements AiCheckContext {
  constructor(
    private readonly projectId: string,
    private readonly deps: ProviderAiCheckContextDeps,
  ) {}

  /**
   * The project's entities closest in meaning to `text`.
   *
   * Entities only: a finding's evidence is entity-grained, so an asset or a
   * generation is not something a check could cite. The excluded row is asked
   * for and then dropped, so a probe that finds itself still comes back with
   * a full set of neighbours.
   */
  async retrieve(request: AiRetrievalRequest): Promise<AiCheckCandidate[]> {
    const limit = request.limit ?? DEFAULT_RETRIEVAL_LIMIT;

    const { items } = await this.deps.search.searchSemantic(this.projectId, {
      text: request.text,
      sourceTypes: ['entity'],
      limit: limit + 1,
    });

    return items
      .filter((item) => item.sourceId !== request.excludeEntityId)
      .slice(0, limit)
      .map((item) => ({ entityId: item.sourceId, score: item.score }));
  }

  /**
   * Records the judgement, asks a provider, and closes the record either way.
   *
   * The record is written before the provider is called, exactly as
   * `GenerationService` intends, so a judgement that never comes back is
   * still on file with the question it was asked. A failure is recorded on
   * the generation and then re-thrown: the caller gets no findings at all
   * rather than findings with nothing behind them.
   */
  async judge(request: AiJudgementRequest): Promise<AiJudgement> {
    const context = await this.deps.contexts.resolve(this.projectId, {
      instruction: request.prompt,
      selectedEntityIds: request.contextEntityIds,
      // The check chose its own set out of one project's facts; walking the
      // graph outwards from it would only add material it already had.
      relatedDepth: 0,
      maxEntities: request.contextEntityIds.length,
    });

    const generation = await this.deps.generations.record(this.projectId, {
      capability: 'text.generate',
      prompt: request.prompt,
      contextEntityIds: request.contextEntityIds,
      resolvedContext: { ...context },
      createdBy: CONSISTENCY_SCAN_ACTOR,
    });

    const candidates = this.deps.providers.candidatesFor('text.generate');
    const firstChoice = candidates[0];
    if (!firstChoice) {
      const failure = new NotFoundError('AI provider for capability', 'text.generate');
      await this.deps.generations.fail(this.projectId, generation.id, {
        code: failure.code,
        message: failure.message,
      });
      throw failure;
    }

    await this.deps.generations.dispatch(this.projectId, generation.id, {
      provider: firstChoice.id,
      model: firstChoice.defaultModel,
    });

    try {
      const result = await this.deps.providers.execute({
        capability: 'text.generate',
        prompt: request.prompt,
        context,
      });

      // `execute` may have fallen through to a later candidate; correct the
      // record so it never names a provider that did not answer.
      const actual = candidates.find((candidate) => candidate.id === result.providerId);
      if (actual && actual.id !== firstChoice.id) {
        await this.deps.generations.redispatch(this.projectId, generation.id, {
          provider: actual.id,
          model: result.model,
        });
      }

      // No assets: a judgement's result is the finding it produces (§9).
      await this.deps.generations.complete(this.projectId, generation.id, {
        outputAssetIds: [],
        providerRequestId: result.requestId ?? null,
      });

      return { generationId: generation.id, output: result.output ?? '' };
    } catch (error) {
      await this.deps.generations.fail(this.projectId, generation.id, {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
