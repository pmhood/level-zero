export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface GetUrlOptions {
  /** How long the URL stays valid. Ignored by providers with no expiry concept. */
  expiresInSeconds?: number;
}

/**
 * One object-storage backend.
 *
 * `AssetService` depends on this instead of an SDK, the same way the domain's
 * repositories depend on a port rather than Drizzle: swapping local disk for
 * S3/R2 in production means registering a different provider, not touching
 * `AssetService` or the `Asset` model. See `@level-zero/ai`'s `AiProvider` for
 * the sibling abstraction this one is shaped after.
 */
export interface ObjectStorageProvider {
  readonly id: string;
  put(input: PutObjectInput): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** A URL safe to hand to a client: signed and time-limited where the provider supports it. */
  getUrl(key: string, options?: GetUrlOptions): Promise<string>;
  delete(key: string): Promise<void>;
}
