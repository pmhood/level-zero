import { describe, expect, it } from 'vitest';

import { LocalImageProvider } from './local-image-provider';
import { type ResolvedContext } from './context';
import { type AiReferenceImage } from './provider';

const provider = new LocalImageProvider();

const reference: AiReferenceImage = {
  assetId: 'asset_1',
  filename: 'kael.png',
  mimeType: 'image/png',
  content: Buffer.from('the-source-pixels', 'utf8'),
};

const context: ResolvedContext = {
  project: { id: 'p1', name: 'Deep Fathom', description: null },
  instruction: 'a drowned cathedral',
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

describe('LocalImageProvider', () => {
  it('returns image bytes rather than a link to fetch later', async () => {
    const result = await provider.execute({
      capability: 'image.generate',
      prompt: 'a drowned cathedral lit from below',
    });

    const [artifact] = result.artifacts ?? [];
    expect(artifact).toMatchObject({ kind: 'image', mimeType: 'image/svg+xml' });
    expect(artifact?.content.toString('utf8')).toContain('<svg');
    expect(result.providerId).toBe('local-image');
  });

  it('sizes the plate from the request', async () => {
    const result = await provider.execute({
      capability: 'image.generate',
      prompt: 'a wide establishing shot',
      parameters: { width: 1920, height: 1080 },
    });

    expect(result.artifacts?.[0]).toMatchObject({ width: 1920, height: 1080 });
    expect(result.artifacts?.[0]?.content.toString('utf8')).toContain('width="1920"');
  });

  it('names the project objects the context brought in', async () => {
    const result = await provider.execute({
      capability: 'image.generate',
      prompt: 'a drowned cathedral',
      context,
    });

    expect(result.artifacts?.[0]?.content.toString('utf8')).toContain('Cradle Trench');
  });

  it('escapes prompt text rather than emitting broken markup', async () => {
    const result = await provider.execute({
      capability: 'image.generate',
      prompt: 'a <script> & a "quote"',
    });

    const svg = result.artifacts?.[0]?.content.toString('utf8') ?? '';
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script>');
  });

  it('serves editing and variation as well as generation', () => {
    expect(provider.supports('image.edit')).toBe(true);
    expect(provider.supports('image.variation')).toBe(true);
    expect(provider.supports('image.generate')).toBe(true);
  });

  it.each(['image.edit', 'image.variation'] as const)(
    'draws the reference it was given into a %s',
    async (capability) => {
      const result = await provider.execute({
        capability,
        prompt: 'warmer light',
        references: [reference],
      });

      const svg = result.artifacts?.[0]?.content.toString('utf8') ?? '';
      expect(svg).toContain(`data:image/png;base64,${reference.content.toString('base64')}`);
      expect(svg).toContain(capability);
      expect(result.data?.referenceAssetIds).toEqual(['asset_1']);
    },
  );

  it.each(['image.edit', 'image.variation'] as const)(
    'refuses a %s with nothing to work from',
    async (capability) => {
      await expect(provider.execute({ capability, prompt: 'warmer light' })).rejects.toThrow(
        /needs at least one reference image/,
      );
    },
  );

  it('generates from nothing without a reference', async () => {
    const result = await provider.execute({
      capability: 'image.generate',
      prompt: 'a drowned cathedral',
    });

    expect(result.artifacts?.[0]?.content.toString('utf8')).not.toContain('<image');
  });
});
