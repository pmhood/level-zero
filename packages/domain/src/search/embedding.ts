/**
 * Turns text into a vector, without saying who does it.
 *
 * The same provider-behind-a-port shape as `ObjectStorageProvider`: the domain
 * states what it needs, and the adapter that knows a vendor lives outside it.
 * `@level-zero/ai` ships the implementations, so nothing in a feature — or in
 * AI orchestration — depends on a particular embedding vendor.
 *
 * Vectors must be unit length, which is what lets similarity be a plain dot
 * product wherever they are compared.
 */
export interface EmbeddingProvider {
  /** Names the vector space. Vectors from different models are not comparable. */
  readonly model: string;
  /** The length of every vector this provider returns. */
  readonly dimensions: number;
  /** One unit-length vector per input, in the order they were given. */
  embed(texts: readonly string[]): Promise<number[][]>;
}
