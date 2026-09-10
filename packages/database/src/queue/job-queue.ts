import { type Job, type JobKind, type JobQueue } from '@level-zero/domain';
import { Queue, Worker, type Job as BullJob } from 'bullmq';
import { Redis } from 'ioredis';

/** The single queue every kind of background work goes through. */
const QUEUE_NAME = 'jobs';

/**
 * Namespace for BullMQ's own keys. It is passed to BullMQ rather than set as an
 * ioredis `keyPrefix`, which BullMQ does not support.
 */
const DEFAULT_QUEUE_PREFIX = 'level-zero';

/** Delay before the first retry; BullMQ doubles it for each attempt after that. */
const RETRY_BACKOFF_MS = 1_000;

/** What travels through Redis: identity only, because the row is the state. */
interface JobMessage {
  jobId: string;
  projectId: string;
}

export interface JobDelivery extends JobMessage {
  kind: JobKind;
  /** Which attempt this is, counting from one. */
  attempt: number;
  /** True when the queue will schedule another attempt if this one throws. */
  willRetry: boolean;
}

export type JobHandler = (delivery: JobDelivery) => Promise<void>;

export interface JobQueueClient extends JobQueue {
  close(): Promise<void>;
}

export interface JobQueueOptions {
  connectionUrl: string;
  /**
   * Namespace for BullMQ's keys. Defaults to the shared production prefix;
   * tests running against a shared Redis pass a run-specific one so a worker
   * only ever sees the jobs its own queue enqueued.
   */
  prefix?: string;
}

/**
 * BullMQ adapter for the domain's `JobQueue` port.
 *
 * The BullMQ job id is the job record's id, so enqueuing the same job twice is
 * a no-op and cancelling one is a direct lookup. Retries and backoff are
 * configured per job from the record's `maxAttempts`, which keeps the schedule
 * the queue runs and the attempt count the record shows from drifting apart.
 */
export function createJobQueue(options: JobQueueOptions): JobQueueClient {
  const connection = createQueueConnection(options.connectionUrl);
  const queue = new Queue<JobMessage>(QUEUE_NAME, {
    connection,
    prefix: options.prefix ?? DEFAULT_QUEUE_PREFIX,
  });

  return {
    enqueue: async (job: Job) => {
      await queue.add(
        job.kind,
        { jobId: job.id, projectId: job.projectId },
        {
          jobId: job.id,
          attempts: job.maxAttempts,
          backoff: { type: 'exponential', delay: RETRY_BACKOFF_MS },
          // Postgres keeps the history; Redis only needs the work in flight.
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    },

    remove: async (job: Job) => {
      // A job a worker already holds is locked; BullMQ refuses to remove it,
      // and the worker stops at its next step by reading the cancelled record.
      await queue.remove(job.id).catch(() => undefined);
    },

    close: async () => {
      await queue.close();
      await connection.quit().catch(() => connection.disconnect());
    },
  };
}

export interface JobConsumerOptions extends JobQueueOptions {
  handle: JobHandler;
  /** How many jobs this process runs at once. */
  concurrency?: number;
  onError?: (error: Error) => void;
}

export interface JobConsumer {
  close(): Promise<void>;
}

/**
 * Runs queued jobs in a worker process.
 *
 * The handler is given the job's identity and whether another attempt follows,
 * and reports the outcome to `JobService` itself: throwing is what tells BullMQ
 * to apply its backoff and try again.
 */
export function createJobConsumer(options: JobConsumerOptions): JobConsumer {
  const connection = createQueueConnection(options.connectionUrl);

  const worker = new Worker<JobMessage>(
    QUEUE_NAME,
    async (message: BullJob<JobMessage>) => {
      await options.handle({
        jobId: message.data.jobId,
        projectId: message.data.projectId,
        kind: message.name as JobKind,
        attempt: message.attemptsStarted,
        willRetry: message.attemptsStarted < (message.opts.attempts ?? 1),
      });
    },
    {
      connection,
      prefix: options.prefix ?? DEFAULT_QUEUE_PREFIX,
      concurrency: options.concurrency ?? 4,
    },
  );

  if (options.onError) worker.on('error', options.onError);

  return {
    close: async () => {
      await worker.close();
      await connection.quit().catch(() => connection.disconnect());
    },
  };
}

/**
 * BullMQ needs its own connection: it blocks indefinitely on reads, which
 * requires `maxRetriesPerRequest: null`, and it namespaces keys itself rather
 * than through ioredis' `keyPrefix`.
 */
function createQueueConnection(connectionUrl: string): Redis {
  return new Redis(connectionUrl, { maxRetriesPerRequest: null });
}
