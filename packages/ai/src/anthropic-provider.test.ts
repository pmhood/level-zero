import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import { ANTHROPIC_DEFAULT_TIMEOUT_MS, AnthropicProvider } from './anthropic-provider';
import { type ResolvedContext } from './context';

interface StubMessage {
  id: string;
  model: string;
  content: { type: string; text?: string }[];
  stop_reason: string;
  stop_details?: { category: string };
  usage: Record<string, number>;
}

/** Records the request the adapter builds and answers with a canned message. */
function stubClient(message: Partial<StubMessage> = {}): {
  client: Anthropic;
  requests: Record<string, unknown>[];
  options: Record<string, unknown>[];
} {
  const requests: Record<string, unknown>[] = [];
  const options: Record<string, unknown>[] = [];
  const create = async (
    params: Record<string, unknown>,
    requestOptions: Record<string, unknown>,
  ): Promise<StubMessage> => {
    requests.push(params);
    options.push(requestOptions);
    return {
      id: 'msg_1',
      model: 'claude-opus-5',
      content: [{ type: 'text', text: 'Three drowned cathedrals.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 12, output_tokens: 34 },
      ...message,
    };
  };

  return { client: { beta: { messages: { create } } } as unknown as Anthropic, requests, options };
}

const context: ResolvedContext = {
  project: { id: 'p1', name: 'Deep Fathom', description: 'A descent sim' },
  instruction: 'name three drowned cathedrals',
  entities: [
    {
      id: 'e1',
      type: 'location',
      name: 'Cradle Trench',
      description: null,
      status: 'active',
      tags: [],
      source: 'selected',
      distance: 0,
      relation: null,
      viaEntityId: null,
    },
  ],
  assets: [],
  lineage: null,
  truncated: false,
};

describe('AnthropicProvider', () => {
  it('serves text.generate and nothing it has no adapter for', () => {
    const provider = new AnthropicProvider({ client: stubClient().client });

    expect(provider.supports('text.generate')).toBe(true);
    expect(provider.supports('text.rewrite')).toBe(true);
    expect(provider.supports('image.generate')).toBe(false);
  });

  it('sends the resolved context as the system prompt and the request as the user turn', async () => {
    const { client, requests } = stubClient();
    const provider = new AnthropicProvider({ client });

    const result = await provider.execute({
      capability: 'text.generate',
      prompt: 'name three drowned cathedrals',
      context,
    });

    expect(requests[0]?.system).toContain('Cradle Trench');
    expect(requests[0]?.messages).toEqual([
      { role: 'user', content: 'name three drowned cathedrals' },
    ]);
    expect(result).toMatchObject({
      providerId: 'anthropic',
      model: 'claude-opus-5',
      requestId: 'msg_1',
      output: 'Three drowned cathedrals.',
    });
  });

  it('uses the model the request named over the adapter default', async () => {
    const { client, requests } = stubClient();
    const provider = new AnthropicProvider({ client });

    await provider.execute({
      capability: 'text.generate',
      prompt: 'x',
      parameters: { model: 'claude-sonnet-5' },
    });

    expect(requests[0]?.model).toBe('claude-sonnet-5');
  });

  it('bounds every call, so a hung provider cannot hold a request open', async () => {
    const { client, options } = stubClient();

    await new AnthropicProvider({ client }).execute({ capability: 'text.rewrite', prompt: 'x' });
    expect(options[0]?.timeout).toBe(ANTHROPIC_DEFAULT_TIMEOUT_MS);

    await new AnthropicProvider({ client, timeoutMs: 5_000 }).execute({
      capability: 'text.rewrite',
      prompt: 'x',
    });
    expect(options[1]?.timeout).toBe(5_000);
  });

  it('fails the generation when the request is declined', async () => {
    const { client } = stubClient({
      stop_reason: 'refusal',
      stop_details: { category: 'cyber' },
      content: [],
    });
    const provider = new AnthropicProvider({ client });

    await expect(provider.execute({ capability: 'text.generate', prompt: 'x' })).rejects.toThrow(
      /declined the request \(cyber\)/,
    );
  });
});
