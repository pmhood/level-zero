import { type Job } from './job';

export interface JobSubscription {
  close(): Promise<void>;
}

/**
 * Fan-out port for job state changes.
 *
 * The worker publishes; the API subscribes and streams to browsers. It exists
 * because the two run in different processes: without it a UI could only learn
 * that a job moved by asking again, which is the polling this queue was built
 * to remove.
 *
 * Delivery is best effort. A client that misses an event reads the job record,
 * which is authoritative.
 */
export interface JobEvents {
  publish(job: Job): Promise<void>;
  /** Listens to every job in one project until the subscription is closed. */
  subscribe(projectId: string, listener: (job: Job) => void): Promise<JobSubscription>;
}
