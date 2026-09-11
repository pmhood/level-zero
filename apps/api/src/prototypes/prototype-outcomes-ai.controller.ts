import {
  ContextResolver,
  type AiCapability,
  type AiProviderRegistry,
  type ResolvedContext,
} from '@level-zero/ai';
import {
  GenerationService,
  OutcomeComparisonService,
  isDomainError,
  outcomeInterpretationPrompt,
} from '@level-zero/domain';
import { BadGatewayException, Body, Controller, Inject, Param, Post } from '@nestjs/common';

import { AI_PROVIDERS } from '../infrastructure/ai.module';
import { InterpretOutcomesDto } from './dto/prototype-outcomes.dto';

/** Reading a briefing and writing prose about it is a plain text generation. */
const INTERPRETATION_CAPABILITY: AiCapability = 'text.generate';

/** What the model was asked to do, recorded as the generation's instruction. */
const INSTRUCTION =
  'Read what changed between two prototype versions and what the playtests of each measured.';

/** An interpretation, and the record that says where it came from. */
export interface OutcomeInterpretation {
  generationId: string;
  interpretation: string;
}

/**
 * One model's reading of a `Changes vs Outcomes` comparison.
 *
 * Kept apart from the comparison endpoint on purpose: that one answers with
 * measured facts, and this one answers with an opinion about them. A surface
 * showing both has to be able to tell them apart, and the split is what makes
 * that unavoidable rather than a matter of styling.
 *
 * It answers **in the request**, like the editor's inline suggestions and
 * unlike `/generations`: a designer asking "what do you make of this" is
 * watching a spinner, and going through the queue would cost a poll loop and a
 * `text/plain` asset per reading. A `Generation` is still recorded either way,
 * so the briefing that was sent, the project context assembled behind it and
 * the provider that answered stay retrievable — which is what lets the surface
 * show the interpretation's provenance beside it.
 */
@Controller('projects/:projectId/prototypes/:prototypeId/versions/outcomes')
export class PrototypeOutcomesAiController {
  constructor(
    private readonly outcomes: OutcomeComparisonService,
    private readonly generations: GenerationService,
    private readonly context: ContextResolver,
    @Inject(AI_PROVIDERS) private readonly providers: AiProviderRegistry,
  ) {}

  @Post('interpretation')
  async interpret(
    @Param('projectId') projectId: string,
    @Param('prototypeId') prototypeId: string,
    @Body() body: InterpretOutcomesDto,
  ): Promise<OutcomeInterpretation> {
    // The facts are re-read here rather than accepted from the caller, so an
    // interpretation is always of what is recorded.
    const comparison = await this.outcomes.compare(projectId, body.from, body.to);

    // Fail before anything is recorded if nothing can serve the capability.
    const candidates = this.providers.candidatesFor(INTERPRETATION_CAPABILITY);
    const firstChoice = this.providers.resolve(INTERPRETATION_CAPABILITY);

    // The prototype and everything whose pin moved are named context, so the
    // walk brings in what those entities are actually connected to.
    const context = await this.context.resolve(projectId, {
      instruction: INSTRUCTION,
      selectedEntityIds: [
        prototypeId,
        ...comparison.designChanges.map((change) => change.entityId),
      ],
    });
    const prompt = outcomeInterpretationPrompt(comparison);

    const generation = await this.generations.record(projectId, {
      capability: INTERPRETATION_CAPABILITY,
      prompt,
      parameters: {
        fromPrototypeVersionId: comparison.from.version.id,
        toPrototypeVersionId: comparison.to.version.id,
      },
      inputEntityIds: namedEntityIds(context),
      contextEntityIds: ambientEntityIds(context),
      resolvedContext: { ...context },
      createdBy: body.createdBy,
    });

    await this.generations.dispatch(projectId, generation.id, {
      provider: firstChoice.id,
      model: firstChoice.defaultModel,
    });

    try {
      const result = await this.providers.execute({
        capability: INTERPRETATION_CAPABILITY,
        prompt,
        parameters: generation.parameters,
        context,
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

      const interpretation = result.output?.trim();
      if (!interpretation) {
        throw new BadGatewayException('The model returned nothing to read.');
      }

      await this.generations.complete(projectId, generation.id, {
        outputAssetIds: [],
        providerRequestId: result.requestId ?? null,
      });

      return { generationId: generation.id, interpretation };
    } catch (error) {
      await this.generations.fail(projectId, generation.id, failure(error));
      // A domain failure keeps its own status; anything the provider threw is
      // an upstream problem, not the caller's.
      throw isDomainError(error) ? error : toBadGateway(error);
    }
  }
}

/** Entities the request pointed at: the prototype, and everything whose pin moved. */
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
