import { NotFoundError, ValidationError } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import { isAiCapability } from './capabilities';
import { EchoAiProvider } from './echo-provider';
import { AiProviderRegistry } from './registry';
import { BaseAiProvider, type AiCapability, type AiRequest, type AiResult } from './index';

class FailingProvider extends BaseAiProvider {
  readonly id = 'failing';
  readonly capabilities: readonly AiCapability[] = ['text.generate'];
  readonly defaultModel = 'failing-1';

  async execute(_request: AiRequest): Promise<AiResult> {
    throw new Error('provider unavailable');
  }
}

describe('isAiCapability', () => {
  it('accepts known capabilities and rejects anything else', () => {
    expect(isAiCapability('image.generate')).toBe(true);
    expect(isAiCapability('text.summarise')).toBe(false);
  });
});

describe('AiProviderRegistry', () => {
  it('resolves a provider by capability without the caller naming a vendor', () => {
    const registry = new AiProviderRegistry().register(
      new EchoAiProvider(['text.generate', 'text.rewrite']),
    );

    expect(registry.resolve('text.rewrite').id).toBe('echo');
  });

  it('throws when no provider implements the capability', () => {
    const registry = new AiProviderRegistry().register(new EchoAiProvider(['text.generate']));

    expect(() => registry.resolve('image.generate')).toThrow(NotFoundError);
  });

  it('rejects duplicate provider ids', () => {
    const registry = new AiProviderRegistry().register(new EchoAiProvider());

    expect(() => registry.register(new EchoAiProvider())).toThrow(ValidationError);
  });

  it('prefers the first registered provider for a capability', () => {
    const registry = new AiProviderRegistry()
      .register(new EchoAiProvider(['text.generate'], 'primary'))
      .register(new EchoAiProvider(['text.generate'], 'secondary'));

    expect(registry.candidatesFor('text.generate').map((p) => p.id)).toEqual([
      'primary',
      'secondary',
    ]);
  });

  it('falls back to the next candidate when a provider fails', async () => {
    const registry = new AiProviderRegistry()
      .register(new FailingProvider())
      .register(new EchoAiProvider(['text.generate'], 'backup'));

    const result = await registry.execute({ capability: 'text.generate', prompt: 'a moody keep' });

    expect(result.providerId).toBe('backup');
    expect(result.output).toBe('a moody keep');
  });

  it('surfaces the last error when every candidate fails', async () => {
    const registry = new AiProviderRegistry().register(new FailingProvider());

    await expect(registry.execute({ capability: 'text.generate', prompt: 'x' })).rejects.toThrow(
      'provider unavailable',
    );
  });

  it('reports a missing capability before attempting execution', async () => {
    const registry = new AiProviderRegistry();

    await expect(registry.execute({ capability: 'code.generate', prompt: 'x' })).rejects.toThrow(
      NotFoundError,
    );
  });
});
