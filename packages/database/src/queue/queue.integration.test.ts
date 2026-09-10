import { loadDotEnv } from '@level-zero/config';
import { createJob, systemClock, uuidIdGenerator, type Job } from '@level-zero/domain';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { testRunId } from '../testing/test-run-id';
import { createJobEvents, type JobEventsClient } from './job-events';
import { createJobConsumer, createJobQueue, type JobConsumer, type JobDelivery } from './job-queue';

/**
 * The queue transport against real Redis: what BullMQ hands a worker, and how a
 * state change reaches the API process. The behaviour worth proving here —
 * retry scheduling, removal, cross-process delivery — lives in Redis, not in
 * TypeScript.
 */
let connectionUrl: string;
let consumer: JobConsumer | undefined;
let events: JobEventsClient | undefined;

/**
 * A checkout-specific BullMQ prefix. Concurrent worktrees run these tests
 * against one shared Redis (see `pnpm infra:up`'s shared project directory),
 * and BullMQ's `Worker` delivers to any queue with a matching name and
 * prefix regardless of which process created it — without this, one
 * worktree's consumer can steal a delivery meant for another's, which is
 * exactly how "retries a failed attempt" lost its first attempt under load.
 */
let queuePrefix: string;

beforeAll(() => {
  loadDotEnv(__dirname);
  connectionUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  queuePrefix = `level-zero-test-${testRunId()}`;
});

afterEach(async () => {
  await consumer?.close();
  await events?.close();
  consumer = undefined;
  events = undefined;
});

function job(overrides: Partial<Job> = {}): Job {
  return {
    ...createJob(
      {
        projectId: uuidIdGenerator.next(),
        kind: 'generation',
        targetId: uuidIdGenerator.next(),
        totalSteps: 3,
      },
      { clock: systemClock, ids: uuidIdGenerator },
    ),
    ...overrides,
  };
}

/** Resolves when `predicate` accepts a value, or rejects once the test gives up. */
function waitFor<T>(register: (accept: (value: T) => void) => void, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), 5_000);
    register((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

describe('the job queue', () => {
  it('delivers a queued job to a worker, carrying identity only', async () => {
    const queued = job();
    const queue = createJobQueue({ connectionUrl, prefix: queuePrefix });

    const delivered = waitFor<JobDelivery>((accept) => {
      consumer = createJobConsumer({
        connectionUrl,
        prefix: queuePrefix,
        handle: async (delivery) => {
          if (delivery.jobId === queued.id) accept(delivery);
        },
      });
    }, 'the job to be delivered');

    await queue.enqueue(queued);
    await expect(delivered).resolves.toMatchObject({
      jobId: queued.id,
      projectId: queued.projectId,
      kind: 'generation',
      attempt: 1,
      willRetry: true,
    });

    await queue.close();
  });

  it('retries a failed attempt until the record runs out of them', async () => {
    const queued = job({ maxAttempts: 2 });
    const queue = createJobQueue({ connectionUrl, prefix: queuePrefix });
    const attempts: JobDelivery[] = [];

    const exhausted = waitFor<JobDelivery[]>((accept) => {
      consumer = createJobConsumer({
        connectionUrl,
        prefix: queuePrefix,
        handle: async (delivery) => {
          if (delivery.jobId !== queued.id) return;
          attempts.push(delivery);
          if (!delivery.willRetry) accept(attempts);
          throw new Error('provider unavailable');
        },
      });
    }, 'every attempt to run');

    await queue.enqueue(queued);
    const runs = await exhausted;

    expect(runs.map((run) => [run.attempt, run.willRetry])).toEqual([
      [1, true],
      [2, false],
    ]);

    await queue.close();
  });

  it('drops a job that is cancelled before a worker picks it up', async () => {
    const queued = job();
    const queue = createJobQueue({ connectionUrl, prefix: queuePrefix });

    await queue.enqueue(queued);
    await queue.remove(queued);

    const deliveries: string[] = [];
    consumer = createJobConsumer({
      connectionUrl,
      prefix: queuePrefix,
      handle: async (delivery) => {
        deliveries.push(delivery.jobId);
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(deliveries).not.toContain(queued.id);
    await queue.close();
  });
});

describe('job events', () => {
  it('carries a state change from one process to another', async () => {
    const changed = job({ status: 'running' });
    events = createJobEvents({ connectionUrl });

    const received = waitFor<Job>((accept) => {
      void events?.subscribe(changed.projectId, accept).then(async () => {
        await events?.publish(changed);
      });
    }, 'the published job');

    const delivered = await received;
    expect(delivered).toMatchObject({ id: changed.id, status: 'running' });
    expect(delivered.createdAt).toBeInstanceOf(Date);
  });

  it('does not deliver another project events', async () => {
    events = createJobEvents({ connectionUrl });
    const mine = job();
    const theirs = job();
    const seen: string[] = [];

    await events.subscribe(mine.projectId, (delivered) => seen.push(delivered.id));
    await events.publish(theirs);
    await events.publish(mine);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(seen).toEqual([mine.id]);
  });
});
