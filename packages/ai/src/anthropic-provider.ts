import Anthropic from '@anthropic-ai/sdk';

import { type AiCapability } from './capabilities';
import { renderContext } from './context';
import { BaseAiProvider, type AiRequest, type AiResult } from './provider';

export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5';
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 16_000;

/**
 * How long one call may take before it is abandoned.
 *
 * Well under the SDK's own ten-minute default, because the API answers the
 * editor's inline suggestions inside the request: a hung provider would
 * otherwise hold an HTTP request — and a writer's suggestion card — open
 * indefinitely.
 */
export const ANTHROPIC_DEFAULT_TIMEOUT_MS = 60_000;

/** Beta flag for server-side refusal fallbacks, in its `"default"` routing form. */
const SERVER_SIDE_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  /** Pre-built SDK client. Tests pass a stub; production lets the SDK build one. */
  client?: Anthropic;
}

/**
 * Anthropic adapter for the text capabilities.
 *
 * This is the only file in the repository that knows what an Anthropic request
 * looks like. The resolved project context becomes the system prompt and the
 * user's words stay the user turn, so the model can tell the brief apart from
 * the world it is writing about.
 */
export class AnthropicProvider extends BaseAiProvider {
  readonly id = 'anthropic';
  readonly capabilities: readonly AiCapability[] = ['text.generate', 'text.rewrite'];
  readonly defaultModel: string;

  private readonly client: Anthropic;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;

  constructor(options: AnthropicProviderOptions = {}) {
    super();
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey });
    this.defaultModel = options.model ?? ANTHROPIC_DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS;
    this.timeoutMs = options.timeoutMs ?? ANTHROPIC_DEFAULT_TIMEOUT_MS;
  }

  async execute(request: AiRequest): Promise<AiResult> {
    const model = requestedModel(request) ?? this.defaultModel;

    const message = await this.client.beta.messages.create(
      {
        model,
        max_tokens: this.maxTokens,
        // Routes past a policy decline to a capable fallback inside the same call.
        betas: [SERVER_SIDE_FALLBACK_BETA],
        fallbacks: 'default',
        ...(request.context ? { system: renderContext(request.context) } : {}),
        messages: [{ role: 'user', content: request.prompt }],
      },
      { timeout: this.timeoutMs },
    );

    if (message.stop_reason === 'refusal') {
      throw new Error(
        `Anthropic declined the request (${message.stop_details?.category ?? 'unspecified'})`,
      );
    }

    return {
      capability: request.capability,
      providerId: this.id,
      // The fallback chain may have answered on a different model than asked for.
      model: message.model,
      requestId: message.id,
      output: message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n'),
      data: { stopReason: message.stop_reason, usage: { ...message.usage } },
    };
  }
}

/** The model the generation asked for, when it asked for one. */
function requestedModel(request: AiRequest): string | null {
  const model = request.parameters?.model;
  return typeof model === 'string' && model.trim().length > 0 ? model.trim() : null;
}
