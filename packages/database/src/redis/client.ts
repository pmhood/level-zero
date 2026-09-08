import { Redis, type RedisOptions } from 'ioredis';

export interface RedisClientOptions {
  connectionUrl: string;
  /** Prefix applied to every key, so apps sharing one Redis stay isolated. */
  keyPrefix?: string;
  /** BullMQ (issue #7) requires this to be null; keep the default unless you know better. */
  maxRetriesPerRequest?: number | null;
  connectTimeoutMs?: number;
}

export interface RedisClient {
  redis: Redis;
  close(): Promise<void>;
}

/**
 * Creates a lazily-connected Redis client. Connecting lazily means an
 * unreachable Redis surfaces on the readiness probe instead of crashing
 * startup.
 */
export function createRedisClient(options: RedisClientOptions): RedisClient {
  const redisOptions: RedisOptions = {
    lazyConnect: true,
    connectTimeout: options.connectTimeoutMs ?? 5_000,
    maxRetriesPerRequest:
      options.maxRetriesPerRequest === undefined ? 3 : options.maxRetriesPerRequest,
    ...(options.keyPrefix ? { keyPrefix: options.keyPrefix } : {}),
  };

  const redis = new Redis(options.connectionUrl, redisOptions);

  // Reconnection is handled by ioredis; log so failures are not silent.
  redis.on('error', (error: Error) => {
    console.error('[redis] connection error', error.message);
  });

  return {
    redis,
    close: async () => {
      await redis.quit().catch(() => redis.disconnect());
    },
  };
}
