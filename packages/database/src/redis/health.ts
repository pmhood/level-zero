import { type Redis } from 'ioredis';

import { measureCheck, type DependencyCheckResult } from '../health';

/** Readiness probe for Redis: a plain `PING` round trip. */
export function checkRedis(redis: Redis): Promise<DependencyCheckResult> {
  return measureCheck(async () => {
    const reply = await redis.ping();
    if (reply !== 'PONG') {
      throw new Error(`unexpected PING reply: ${reply}`);
    }
    return { status: redis.status };
  });
}
