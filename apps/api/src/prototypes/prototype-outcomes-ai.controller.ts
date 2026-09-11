import { ContextResolver, type AiCapability } from '@level-zero/ai';
import { OutcomeComparisonService, outcomeInterpretationPrompt } from '@level-zero/domain';
import { BadGatewayException, Body, Controller, Param, Post } from '@nestjs/common';

import { InlineAiRequestService } from '../infrastructure/inline-ai-request.service';
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
    private readonly context: ContextResolver,
    private readonly inlineAiRequests: InlineAiRequestService,
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

    // The prototype and everything whose pin moved are named context, so the
    // walk brings in what those entities are actually connected to.
    const context = await this.context.resolve(projectId, {
      instruction: INSTRUCTION,
      selectedEntityIds: [
        prototypeId,
        ...comparison.designChanges.map((change) => change.entityId),
      ],
    });

    return this.inlineAiRequests.run(
      projectId,
      {
        capability: INTERPRETATION_CAPABILITY,
        prompt: outcomeInterpretationPrompt(comparison),
        parameters: {
          fromPrototypeVersionId: comparison.from.version.id,
          toPrototypeVersionId: comparison.to.version.id,
        },
        context,
        createdBy: body.createdBy,
      },
      (result, generation) => {
        const interpretation = result.output?.trim();
        if (!interpretation) {
          throw new BadGatewayException('The model returned nothing to read.');
        }
        return { generationId: generation.id, interpretation };
      },
    );
  }
}
