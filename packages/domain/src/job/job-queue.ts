import { type Job } from './job';

/**
 * Transport port for handing persisted jobs to a worker process.
 *
 * The queue carries identity only — the row in Postgres is the state — so a
 * worker that picks a job up reads the same record the API wrote, and the
 * queue's own bookkeeping never becomes a second source of truth. Retries and
 * backoff are the queue's job, which is why `enqueue` is told how many attempts
 * the record allows.
 */
export interface JobQueue {
  enqueue(job: Job): Promise<void>;
  /** Drops a job that has not started. A job already in a worker is unaffected. */
  remove(job: Job): Promise<void>;
}
