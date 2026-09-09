import { describe, expect, it } from 'vitest';

import { LOCAL_EMBEDDING_DIMENSIONS, LocalEmbeddingProvider } from './local-embedding-provider';

const provider = new LocalEmbeddingProvider();

async function similarity(left: string, right: string): Promise<number> {
  const [a, b] = await provider.embed([left, right]);
  if (!a || !b) throw new Error('expected two vectors');

  return a.reduce((total, value, index) => total + value * (b[index] ?? 0), 0);
}

describe('local embeddings', () => {
  it('returns one unit-length vector of the declared width per input', async () => {
    const vectors = await provider.embed(['Oxygen Drain', 'The Trench']);

    expect(vectors).toHaveLength(2);
    for (const vector of vectors) {
      expect(vector).toHaveLength(LOCAL_EMBEDDING_DIMENSIONS);
      expect(Math.hypot(...vector)).toBeCloseTo(1, 10);
    }
  });

  it('is deterministic, so a stored vector stays comparable across processes', async () => {
    const [first] = await provider.embed(['Oxygen Drain']);
    const [second] = await new LocalEmbeddingProvider().embed(['Oxygen Drain']);

    expect(first).toEqual(second);
  });

  it('gives a vector of zeroes for text with nothing in it', async () => {
    const [vector] = await provider.embed(['   ']);

    expect(vector?.every((value) => value === 0)).toBe(true);
  });

  it('scores a question about the same material above unrelated material', async () => {
    const question = 'the mechanic where oxygen limits exploration';
    const related =
      'Oxygen Drain: the diver’s oxygen falls while exploring the trench, forcing a return';
    const unrelated = 'Canopy Market: a bartering hub in the upper forest';

    expect(await similarity(question, related)).toBeGreaterThan(
      await similarity(question, unrelated),
    );
  });

  it('gives partial credit to a word spelled differently, through its trigrams', async () => {
    // "exploring" and "exploration" share no whole token, only characters.
    expect(await similarity('exploring', 'exploration')).toBeGreaterThan(0);
    expect(await similarity('exploring', 'bartering')).toBeLessThan(
      await similarity('exploring', 'exploration'),
    );
  });
});
