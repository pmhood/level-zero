import { type ProjectRepository } from '../project/project-repository';
import { type Clock } from '../shared/clock';
import { ConflictError, NotFoundError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { normalizePaging } from '../shared/paging';
import {
  ACTIVE_JOB_STATUSES,
  advanceJob,
  cancelJob,
  createJob,
  failJob,
  reportJobProgress,
  retryJob,
  type AdvanceJobInput,
  type CreateJobInput,
  type FailJobInput,
  type Job,
  type JobKind,
  type JobProgressInput,
} from './job';
import { type JobEvents } from './job-events';
import { type JobQueue } from './job-queue';
import { type JobListFilter, type JobPage, type JobRepository } from './job-repository';

export interface JobServiceDeps {
  clock: Clock;
  ids: IdGenerator;
}

export type EnqueueJobInput = Omit<CreateJobInput, 'projectId'>;

/**
 * Application service for background work.
 *
 * Domain services enqueue through this; nothing here knows what a job actually
 * does. The record is written before the queue is told about it, so a job that
 * is accepted is visible even if Redis drops it, and every state change is
 * published so a browser can watch it happen instead of asking again.
 *
 * Retries and backoff belong to the queue, which is why `retry` and `fail` are
 * separate: the worker reports which one happened rather than this service
 * guessing at a schedule the queue owns.
 */
export class JobService {
  constructor(
    private readonly jobs: JobRepository,
    private readonly projects: ProjectRepository,
    private readonly queue: JobQueue,
    private readonly events: JobEvents,
    private readonly deps: JobServiceDeps,
  ) {}

  /** Records the job, then hands it to the queue for a worker to pick up. */
  async enqueue(projectId: string, input: EnqueueJobInput): Promise<Job> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    if (project.status === 'archived') {
      throw new ConflictError('Cannot queue work in an archived project', { projectId });
    }

    const job = await this.jobs.insert(createJob({ ...input, projectId }, this.deps));
    await this.queue.enqueue(job);
    await this.events.publish(job);
    return job;
  }

  /** Throws `NotFoundError` rather than returning null: callers want the record. */
  async getById(projectId: string, jobId: string): Promise<Job> {
    const job = await this.jobs.findById(projectId, jobId);
    if (!job) throw new NotFoundError('Job', jobId);
    return job;
  }

  async listByProject(projectId: string, filter: JobListFilter = {}): Promise<JobPage> {
    const { limit, offset } = normalizePaging(filter.limit, filter.offset);
    return this.jobs.listByProject(projectId, { ...filter, limit, offset });
  }

  /** Moves a job to its next status, recording the step it is on. */
  async advance(projectId: string, jobId: string, input: AdvanceJobInput): Promise<Job> {
    return this.transition(projectId, jobId, (job) => advanceJob(job, input, this.deps));
  }

  /** Reports progress within the current status, for a step that ticks as it runs. */
  async reportProgress(projectId: string, jobId: string, input: JobProgressInput): Promise<Job> {
    return this.transition(projectId, jobId, (job) => reportJobProgress(job, input, this.deps));
  }

  /** Records an attempt that failed and that the queue will run again. */
  async retry(projectId: string, jobId: string, input: FailJobInput): Promise<Job> {
    return this.transition(projectId, jobId, (job) => retryJob(job, input, this.deps));
  }

  /** Ends a job for good. */
  async fail(projectId: string, jobId: string, input: FailJobInput): Promise<Job> {
    return this.transition(projectId, jobId, (job) => failJob(job, input, this.deps));
  }

  /**
   * Cancels a job and drops it from the queue.
   *
   * A job a worker has already started stays cancelled in the record and stops
   * at its next step, because provider work in flight cannot be recalled.
   */
  async cancel(projectId: string, jobId: string): Promise<Job> {
    const cancelled = await this.transition(projectId, jobId, (job) => cancelJob(job, this.deps));
    await this.queue.remove(cancelled);
    return cancelled;
  }

  /** Cancels the active job for one record, if it still has one. */
  async cancelForTarget(projectId: string, kind: JobKind, targetId: string): Promise<Job | null> {
    const { items } = await this.jobs.listByProject(projectId, {
      kind,
      targetId,
      statuses: ACTIVE_JOB_STATUSES,
      limit: 1,
    });

    const job = items[0];
    return job ? this.cancel(projectId, job.id) : null;
  }

  private async transition(
    projectId: string,
    jobId: string,
    change: (job: Job) => Job,
  ): Promise<Job> {
    const job = await this.getById(projectId, jobId);
    const saved = await this.jobs.save(change(job));
    await this.events.publish(saved);
    return saved;
  }
}
