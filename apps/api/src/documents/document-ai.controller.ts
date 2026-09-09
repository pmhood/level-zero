import {
  ContextResolver,
  type AiCapability,
  type AiProviderRegistry,
  type ResolvedContext,
} from '@level-zero/ai';
import { DocumentService, GenerationService, isDomainError } from '@level-zero/domain';
import { BadGatewayException, Body, Controller, Inject, Param, Post } from '@nestjs/common';

import { AI_PROVIDERS } from '../infrastructure/ai.module';
import { SuggestDocumentEditDto } from './dto/document-ai.dto';

/** Rewriting a passage of a document, whatever the writer called the action. */
const SUGGESTION_CAPABILITY: AiCapability = 'text.rewrite';

/** What the editor gets back: the prose to preview, and the record behind it. */
export interface DocumentSuggestion {
  generationId: string;
  suggestion: string;
}

/**
 * Inline AI editing for one document.
 *
 * This answers **in the request**, unlike `/generations`, which records the
 * ask and hands it to the worker. The difference is what the user is doing:
 * an image generation is work they walk away from, and a rewrite of the
 * sentence they have selected is work they are watching a spinner for. Going
 * through the queue would cost a poll loop and a `text/plain` asset per
 * attempt, including every attempt the writer throws away.
 *
 * A `Generation` is still recorded either way, so the instruction, the project
 * context that was assembled and the provider that answered are all
 * retrievable afterwards. What is *not* recorded is the suggested prose: until
 * a writer accepts it, it is not part of the project, and once they do the
 * change is kept where it happened — an `ai_edit` document version naming this
 * generation.
 */
@Controller('projects/:projectId/documents/:documentId/ai')
export class DocumentAiController {
  constructor(
    private readonly documents: DocumentService,
    private readonly generations: GenerationService,
    private readonly context: ContextResolver,
    @Inject(AI_PROVIDERS) private readonly providers: AiProviderRegistry,
  ) {}

  @Post('suggestions')
  async suggest(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Body() body: SuggestDocumentEditDto,
  ): Promise<DocumentSuggestion> {
    // Reads as the document it claims to be, in the project it claims to be in.
    await this.documents.getById(projectId, documentId);

    // Fail before anything is recorded if nothing can serve the capability.
    const candidates = this.providers.candidatesFor(SUGGESTION_CAPABILITY);
    const firstChoice = this.providers.resolve(SUGGESTION_CAPABILITY);

    // The document itself is named context, so the model reads the section it
    // is editing, and the walk brings in what the passage points at.
    const context = await this.context.resolve(projectId, {
      instruction: body.instruction,
      selectedEntityIds: [documentId],
      mentionedEntityIds: body.mentionedEntityIds ?? [],
    });
    const prompt = suggestionPrompt(body);

    const generation = await this.generations.record(projectId, {
      capability: SUGGESTION_CAPABILITY,
      prompt,
      parameters: { action: body.action },
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
        capability: SUGGESTION_CAPABILITY,
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

      const suggestion = result.output?.trim();
      if (!suggestion) {
        throw new BadGatewayException('The model returned nothing to suggest.');
      }

      await this.generations.complete(projectId, generation.id, {
        outputAssetIds: [],
        providerRequestId: result.requestId ?? null,
      });

      return { generationId: generation.id, suggestion };
    } catch (error) {
      await this.generations.fail(projectId, generation.id, failure(error));
      // A domain failure keeps its own status; anything the provider threw is
      // an upstream problem, not the caller's.
      throw isDomainError(error) ? error : toBadGateway(error);
    }
  }
}

/**
 * The prompt behind one suggestion: what the writer asked, the passage, and
 * the rules every suggestion has to satisfy however it was asked for.
 *
 * The mention rule is the load-bearing one. Model output is plain text, and
 * the editor rebuilds a mention from the token it comes back with, so a model
 * that rewrites `@Kael Voss` into "Kael" silently costs the document a link.
 */
function suggestionPrompt(request: SuggestDocumentEditDto): string {
  const passage = request.selection?.trim();

  return [
    request.instruction,
    passage
      ? `Passage:\n${passage}`
      : 'There is no passage: write what belongs at this point in the document.',
    [
      'Rules:',
      '- Reply with the replacement text only. No preamble, no commentary, no surrounding quotes, no Markdown fences.',
      '- Keep every @Name token exactly as it appears. Each one links to a project object, and rewriting or dropping one breaks that link.',
      '- Write in the voice of the surrounding document.',
    ].join('\n'),
  ].join('\n\n');
}

/** Entities the writer pointed at: the document, and anything mentioned in the passage. */
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
