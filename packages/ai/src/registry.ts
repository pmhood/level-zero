import { NotFoundError, ValidationError } from '@level-zero/domain';

import { type AiCapability } from './capabilities';
import { type AiProvider, type AiRequest, type AiResult } from './provider';

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
   * Throws the last error if every candidate fails.
   */
  async execute(request: AiRequest): Promise<AiResult> {
    const candidates = this.candidatesFor(request.capability);
    if (candidates.length === 0) {
      throw new NotFoundError('AI provider for capability', request.capability);
    }

    let lastError: unknown;
    for (const provider of candidates) {
      try {
        return await provider.execute(request);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}
