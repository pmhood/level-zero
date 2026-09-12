import { NotFoundError, ValidationError } from '@level-zero/domain';

import { type AiCapability } from './capabilities';
import { type AiProvider, type AiRequest, type AiResult } from './provider';

/** One provider candidate that was tried and why it failed, in trial order. */
export interface AiProviderAttempt {
  provider: string;
  model: string;
  message: string;
}

/**
 * Every candidate for a capability failed.
 *
 * Carries the whole attempt sequence — not just the last error — so a caller
 * can record what was actually tried. `message` is still the last candidate's,
 * so a caller that only reads the message gets the same text `execute` always
 * reported.
 *
 * Deliberately not a `DomainError`: this is an upstream provider failure, the
 * same kind of thing a single failing candidate has always thrown, not a
 * domain-level rule being broken. A caller that treats "no domain error" as
 * "an upstream problem" (`InlineAiRequestService`'s `BadGatewayException`
 * mapping, say) should still do exactly that once every candidate fails.
 */
export class AiProvidersExhaustedError extends Error {
  readonly attempts: readonly AiProviderAttempt[];

  constructor(capability: AiCapability, attempts: readonly AiProviderAttempt[]) {
    const last = attempts[attempts.length - 1];
    super(last?.message ?? `No AI provider for capability "${capability}" produced a result`);
    this.name = 'AiProvidersExhaustedError';
    this.attempts = attempts;
  }
}

/**
 * Resolves capabilities to providers in registration order, so the first
 * registered provider that supports a capability wins and later ones act as
 * fallbacks.
 */
export class AiProviderRegistry {
  private readonly providers: AiProvider[] = [];

  register(provider: AiProvider): this {
    if (this.providers.some((existing) => existing.id === provider.id)) {
      throw new ValidationError(`An AI provider with id "${provider.id}" is already registered`, {
        providerId: provider.id,
      });
    }
    this.providers.push(provider);
    return this;
  }

  list(): readonly AiProvider[] {
    return [...this.providers];
  }

  /** Every provider able to serve `capability`, preferred first. */
  candidatesFor(capability: AiCapability): readonly AiProvider[] {
    return this.providers.filter((provider) => provider.supports(capability));
  }

  resolve(capability: AiCapability): AiProvider {
    const provider = this.candidatesFor(capability)[0];
    if (!provider) {
      throw new NotFoundError('AI provider for capability', capability);
    }
    return provider;
  }

  /**
   * Runs a request, falling back to the next candidate when a provider fails.
   * Throws `AiProvidersExhaustedError` if every candidate fails.
   */
  async execute(request: AiRequest): Promise<AiResult> {
    const candidates = this.candidatesFor(request.capability);
    if (candidates.length === 0) {
      throw new NotFoundError('AI provider for capability', request.capability);
    }

    const attempts: AiProviderAttempt[] = [];
    for (const provider of candidates) {
      try {
        return await provider.execute(request);
      } catch (error) {
        attempts.push({
          provider: provider.id,
          model: candidateModel(request, provider),
          message: describeError(error),
        });
      }
    }
    throw new AiProvidersExhaustedError(request.capability, attempts);
  }
}

/** The model a candidate would have used: the request's own, or its default. */
function candidateModel(request: AiRequest, provider: AiProvider): string {
  const requested = request.parameters?.model;
  return typeof requested === 'string' && requested.trim().length > 0
    ? requested.trim()
    : provider.defaultModel;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
