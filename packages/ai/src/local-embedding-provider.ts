import { type EmbeddingProvider } from '@level-zero/domain';

export const LOCAL_EMBEDDING_MODEL = 'local-hashing-1';
export const LOCAL_EMBEDDING_DIMENSIONS = 256;

/** Below this, a token's character n-grams say nothing its spelling does not. */
const MIN_NGRAM_TOKEN_LENGTH = 4;
const NGRAM_LENGTH = 3;

/**
 * Credential-free `EmbeddingProvider` for local development and tests.
 *
 * It hashes words *and* their character trigrams into a fixed number of
 * buckets, so "exploring" and "exploration" land on overlapping features and a
 * question phrased differently from the text still scores against it. That is
 * as far as it goes: it has no idea that oxygen and breathing are related, and
 * a hosted embedding model would. It is the same bargain as
 * `LocalImageProvider` — the whole path runs on a machine with no credentials,
 * and swapping in a hosted model is one registration and nothing else.
 *
 * Vectors are unit length, which is the contract the port states and what lets
 * similarity be a dot product wherever they are compared.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly model = LOCAL_EMBEDDING_MODEL;
  readonly dimensions = LOCAL_EMBEDDING_DIMENSIONS;

  async embed(texts: readonly string[]): Promise<number[][]> {
    return texts.map((text) => this.embedOne(text));
  }

  private embedOne(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);

    for (const feature of features(text)) {
      const hash = fnv1a(feature);
      // The top bit picks the sign, which keeps colliding features from all
      // pushing the same bucket in the same direction.
      const bucket = hash % this.dimensions;
      vector[bucket] = (vector[bucket] ?? 0) + ((hash & 0x80000000) === 0 ? 1 : -1);
    }

    const length = Math.hypot(...vector);
    return length === 0 ? vector : vector.map((value) => value / length);
  }
}

/** Words plus their character trigrams, which is what gives partial credit. */
function* features(text: string): Generator<string> {
  for (const token of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (token.length === 0) continue;
    yield token;

    if (token.length < MIN_NGRAM_TOKEN_LENGTH) continue;
    const padded = ` ${token} `;
    for (let start = 0; start + NGRAM_LENGTH <= padded.length; start += 1) {
      yield padded.slice(start, start + NGRAM_LENGTH);
    }
  }
}

/** FNV-1a, 32-bit: small, fast and stable across processes. */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
