import { ContextResolver, type AiCapability } from '@level-zero/ai';
import { DocumentService } from '@level-zero/domain';
import { BadGatewayException, Body, Controller, Param, Post } from '@nestjs/common';

import { InlineAiRequestService } from '../infrastructure/inline-ai-request.service';
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
    private readonly context: ContextResolver,
    private readonly inlineAiRequests: InlineAiRequestService,
  ) {}

  @Post('suggestions')
  async suggest(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Body() body: SuggestDocumentEditDto,
  ): Promise<DocumentSuggestion> {
    // Reads as the document it claims to be, in the project it claims to be in.
    await this.documents.getById(projectId, documentId);

    // The document itself is named context, so the model reads the section it
    // is editing, and the walk brings in what the passage points at.
    const context = await this.context.resolve(projectId, {
      instruction: body.instruction,
      selectedEntityIds: [documentId],
      mentionedEntityIds: body.mentionedEntityIds ?? [],
    });

    return this.inlineAiRequests.run(
      projectId,
      {
        capability: SUGGESTION_CAPABILITY,
        prompt: suggestionPrompt(body),
        parameters: { action: body.action },
        context,
        createdBy: body.createdBy,
      },
      (result, generation) => {
        const suggestion = result.output?.trim();
        if (!suggestion) {
          throw new BadGatewayException('The model returned nothing to suggest.');
        }
        return { generationId: generation.id, suggestion };
      },
    );
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
