import { type Job, type JobKind, type JobStatus } from './job';

export interface JobListFilter {
  statuses?: readonly JobStatus[];
  kind?: JobKind;
  /** The record the job acts on — a generation id, for `generation` jobs. */
  targetId?: string;
  limit?: number;
  offset?: number;
}

export interface JobPage {
  items: Job[];
  /** Total matching rows, ignoring `limit`/`offset`. */
  total: number;
}

/**
 * Storage port for job records.
 *
 * There is no delete: the row is what a reconnecting browser reads to find out
 * how a piece of work ended. Every read is scoped by `projectId`, the same as
 * every other repository here.
 */
export interface JobRepository {
  insert(job: Job): Promise<Job>;
  findById(projectId: string, jobId: string): Promise<Job | null>;
  listByProject(projectId: string, filter: JobListFilter): Promise<JobPage>;
  save(job: Job): Promise<Job>;
}
