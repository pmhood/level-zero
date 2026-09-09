import { type Job, type JobEvents, type JobSubscription } from '@level-zero/domain';
import { Redis } from 'ioredis';

const CHANNEL_PREFIX = 'level-zero:jobs:';

export interface JobEventsClient extends JobEvents {
  close(): Promise<void>;
}

export interface JobEventsOptions {
  connectionUrl: string;
}

/**
 * Redis pub/sub adapter for the domain's `JobEvents` port.
 *
 * A worker publishes on its project's channel and the API relays to whichever
 * browsers are watching, so a state change crosses the process boundary in one
 * hop instead of being discovered by the next poll.
 *
 * All subscribers share one connection — a Redis client in subscriber mode
 * cannot do anything else, so one per streaming browser would be one connection
 * per open tab. Delivery is best effort by design: a client that misses an
 * event re-reads the job record, which is authoritative.
 */
export function createJobEvents(options: JobEventsOptions): JobEventsClient {
  const publisher = createConnection(options.connectionUrl);
  const subscriber = createConnection(options.connectionUrl);
  const listeners = new Map<string, Set<(job: Job) => void>>();

  subscriber.on('message', (channel: string, payload: string) => {
    const projectId = channel.slice(CHANNEL_PREFIX.length);
    const job = parseJob(payload);
    if (!job) return;

    for (const listener of listeners.get(projectId) ?? []) listener(job);
  });

  return {
    publish: async (job: Job) => {
      await publisher.publish(channelFor(job.projectId), JSON.stringify(job));
    },

    subscribe: async (projectId: string, listener: (job: Job) => void) => {
      const existing = listeners.get(projectId);
      if (existing) {
        existing.add(listener);
      } else {
        listeners.set(projectId, new Set([listener]));
        await subscriber.subscribe(channelFor(projectId));
      }

      return {
        close: async () => {
          const current = listeners.get(projectId);
          if (!current?.delete(listener) || current.size > 0) return;
          listeners.delete(projectId);
          await subscriber.unsubscribe(channelFor(projectId));
        },
      } satisfies JobSubscription;
    },

    close: async () => {
      listeners.clear();
      await Promise.all([quit(publisher), quit(subscriber)]);
    },
  };
}

function channelFor(projectId: string): string {
  return `${CHANNEL_PREFIX}${projectId}`;
}

/**
 * Rebuilds the timestamps `JSON.stringify` flattened. A payload that does not
 * parse is dropped rather than thrown: the record is authoritative, and a
 * malformed event must not take down every other subscriber on the connection.
 */
function parseJob(payload: string): Job | null {
  try {
    const raw = JSON.parse(payload) as Job;
    return {
      ...raw,
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
      startedAt: raw.startedAt ? new Date(raw.startedAt) : null,
      completedAt: raw.completedAt ? new Date(raw.completedAt) : null,
    };
  } catch (error) {
    console.error('[jobs] discarded an unreadable job event', error);
    return null;
  }
}

function createConnection(connectionUrl: string): Redis {
  const redis = new Redis(connectionUrl);
  // Reconnection is handled by ioredis; log so failures are not silent.
  redis.on('error', (error: Error) => {
    console.error('[jobs] redis connection error', error.message);
  });
  return redis;
}

async function quit(redis: Redis): Promise<void> {
  await redis.quit().catch(() => redis.disconnect());
}
