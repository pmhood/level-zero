import {
  AI_CAPABILITIES,
  ContextResolver,
  type AiCapability,
  type AiProviderRegistry,
  type ResolvedContext,
} from '@level-zero/ai';
import {
  ConflictError,
  EntityService,
  GenerationService,
  LineageService,
  type Entity,
} from '@level-zero/domain';
import { BadGatewayException, Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';

import { AI_PROVIDERS, InlineAiRequestService } from '../infrastructure/inline-ai-request.service';
import { ApplyInspectorResultDto, RunInspectorActionDto } from './dto/inspector-ai.dto';

/** What the inspector can offer: the capabilities something here can actually serve. */
export interface InspectorCapabilities {
  capabilities: AiCapability[];
}

/** One answer, and everything needed to say where it came from. */
export interface InspectorActionResult {
  generationId: string;
  action: string;
  capability: AiCapability;
  /** The recommendation, verbatim. Nothing is written to the project yet. */
  output: string;
  /** The project material the request carried, for the inspector's disclosure. */
  context: ResolvedContext;
}

/**
 * The contextual AI inspector: one surface for "what can AI do with what I
 * have selected", whatever workspace the selection came from.
 *
 * Answers **in the request**, like `DocumentAiController` and for the same
 * reason: the user is watching a spinner on a card in a 320px panel, not
 * walking away from a render. The deliberate consequence is that only text
 * capabilities belong here — image work stays with `/generations` and the
 * worker, which is where its progress, retries and output assets already live.
 *
 * Two rules hold whatever the selection is. The subject is resolved fresh from
 * the ids on *this* request, so switching selection cannot carry the previous
 * subject into the next ask; and the answer is never written to the project by
 * this endpoint. Accepting one is a second, explicit call — `/apply` — and even
 * that only adds a draft idea beside the subject rather than rewriting it.
 */
@Controller('projects/:projectId/ai')
export class InspectorAiController {
  constructor(
    private readonly generations: GenerationService,
    private readonly entities: EntityService,
    private readonly lineage: LineageService,
    private readonly context: ContextResolver,
    @Inject(AI_PROVIDERS) private readonly providers: AiProviderRegistry,
    private readonly inlineAiRequests: InlineAiRequestService,
  ) {}

  /**
   * Which capabilities have a provider behind them here.
   *
   * The inspector's actions each name a capability, so this is what lets it
   * offer an action as unavailable rather than as a button that always fails.
   */
  @Get('capabilities')
  capabilities(): InspectorCapabilities {
    return {
      capabilities: AI_CAPABILITIES.filter(
        (capability) => this.providers.candidatesFor(capability).length > 0,
      ),
    };
  }

  @Post('actions')
  async run(
    @Param('projectId') projectId: string,
    @Body() body: RunInspectorActionDto,
  ): Promise<InspectorActionResult> {
    const context = await this.context.resolve(projectId, {
      instruction: body.instruction,
      selectedEntityIds: body.selectedEntityIds ?? [],
      mentionedEntityIds: body.mentionedEntityIds ?? [],
      assetIds: body.assetIds ?? [],
      ...(body.relatedDepth === undefined ? {} : { relatedDepth: body.relatedDepth }),
    });

    return this.inlineAiRequests.run(
      projectId,
      {
        capability: body.capability,
        prompt: actionPrompt(body),
        parameters: { action: body.action },
        context,
        createdBy: body.createdBy,
      },
      (result, generation) => {
        const output = result.output?.trim();
        if (!output) {
          throw new BadGatewayException('The model returned nothing.');
        }
        return {
          generationId: generation.id,
          action: body.action,
          capability: body.capability,
          output,
          context,
        };
      },
    );
  }

  /**
   * Accepts one recommendation, as a draft `idea` linked back to what it was
   * about.
   *
   * An idea rather than an edit to the subject, on purpose: a critique of a
   * mechanic is an opinion about the design, and the project already has a
   * first-class home for those *and* a promotion path out of one. So accepting
   * is additive — the character, mechanic or document the ask was about is
   * exactly as it was — and the new idea carries `generated_from` edges to
   * everything that went into the request, so it can always say where it came
   * from.
   */
  @Post('actions/:generationId/apply')
  async apply(
    @Param('projectId') projectId: string,
    @Param('generationId') generationId: string,
    @Body() body: ApplyInspectorResultDto,
  ): Promise<Entity> {
    const generation = await this.generations.getById(projectId, generationId);
    if (generation.status !== 'complete') {
      throw new ConflictError('Only a completed generation can be accepted', {
        generationId,
        status: generation.status,
      });
    }

    const idea = await this.entities.create(projectId, {
      type: 'idea',
      name: body.name,
      description: body.text,
      tags: body.tags ?? [],
      data: { generationId: generation.id, action: generation.parameters.action ?? null },
    });

    await this.lineage.recordGeneratedFrom(
      projectId,
      idea.id,
      [...generation.inputEntityIds, ...generation.contextEntityIds],
      { generationId: generation.id },
    );

    return idea;
  }
}

/**
 * The prompt behind one inspector answer: what the action asked, the workspace
 * material the graph does not hold, and the rules every answer has to satisfy
 * however it was asked for.
 *
 * The grounding rule is the load-bearing one. The resolved context arrives as
 * the briefing the model reads, and an answer that invents a faction or
 * contradicts a stated rule is worse than no answer — it is a recommendation
 * the user has to fact-check against their own project.
 */
function actionPrompt(request: RunInspectorActionDto): string {
  const excerpt = request.excerpt?.trim();

  return [
    request.instruction,
    ...(excerpt ? [`Workspace material:\n${excerpt}`] : []),
    [
      'Rules:',
      '- Reply with the answer itself. No preamble, no restatement of the request, no sign-off.',
      '- Ground it in the project material above. Where the material does not settle something, say so rather than inventing it.',
      '- Never contradict what the project material already establishes.',
      '- Plain prose or a short list. No Markdown fences.',
    ].join('\n'),
  ].join('\n\n');
}
