import { type Clock } from '../shared/clock';
import { ConflictError, ValidationError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import {
  optionalText,
  requireJsonObject,
  requireNonNegativeInt,
  requireOneOf,
  requireText,
} from '../shared/validation';

/**
 * Where a background job is in its life.
 *
 * The states are what a progress indicator needs to say something honest while
 * a worker runs: `preparing_context` and `processing` are the bookends around
 * the provider call, and they are distinct from `running` because they are the
 * parts the workspace controls and can explain. `complete`, `failed` and
 * `cancelled` are terminal.
 */
export const JOB_STATUSES = [
  'queued',
  'preparing_context',
  'running',
  'processing',
  'complete',
  'failed',
  'cancelled',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * What a job does. The queue routes on it, and the worker picks the handler.
 *
 * `search_index` refreshes a project's searchable copy and builds the vectors
 * behind semantic retrieval — a provider call, so it belongs out here rather
 * than in the request that changed the material.
 */
export const JOB_KINDS = ['generation', 'search_index'] as const;
export type JobKind = (typeof JOB_KINDS)[number];

/**
 * Where each status may go next. A retry is not in here — it moves backwards to
 * `queued` and is expressed by `retryJob`, so an ordinary forward step can
 * never accidentally rewind a job.
 */
const NEXT_STATUSES: Record<JobStatus, readonly JobStatus[]> = {
  queued: ['preparing_context', 'running'],
  preparing_context: ['running'],
  running: ['processing', 'complete'],
  processing: ['complete'],
  complete: [],
  failed: [],
  cancelled: [],
};

/** The statuses a job can still move out of, in the order it moves through them. */
export const ACTIVE_JOB_STATUSES = [
  'queued',
  'preparing_context',
  'running',
  'processing',
] as const satisfies readonly JobStatus[];

export const DEFAULT_JOB_MAX_ATTEMPTS = 3;
export const MAX_JOB_ATTEMPTS = 10;
export const MAX_JOB_STEPS = 1000;
export const MAX_JOB_STEP_LENGTH = 200;
export const MAX_JOB_FAILURE_MESSAGE_LENGTH = 2000;
export const DEFAULT_JOB_FAILURE_CODE = 'job_error';

/**
 * Explicit progress, so a UI can say "2 of 4 complete" and name the step
 * instead of animating an indeterminate bar.
 */
export interface JobProgress {
  /** Steps finished so far. */
  completed: number;
  /** Steps this job will run in total; at least one. */
  total: number;
  /** What the job is doing right now, shown to the user verbatim. */
  step: string | null;
}

/** Why a job failed, kept on the record so a retry can be explained. */
export interface JobFailure {
  /** Stable discriminator: `provider_error`, `timeout`, ... */
  code: string;
  message: string;
  details: Record<string, unknown>;
}

/**
 * One unit of long-running work, owned by the queue rather than by a request.
 *
 * The row is written before anything is enqueued and is the source of truth for
 * status and progress: Redis carries only the job's identity, so a browser that
 * reconnects — or a worker that picks the job up on a second attempt — reads
 * the same record rather than a queue's internal state.
 *
 * `targetId` names the record the job acts on (a generation, for the one kind
 * that exists). It is deliberately not a foreign key: which table it points at
 * is decided by `kind`.
 */
export interface Job {
  id: string;
  projectId: string;
  kind: JobKind;
  targetId: string;
  status: JobStatus;
  progress: JobProgress;
  /** Which attempt is current, counting from one. */
  attempt: number;
  /** How many attempts the queue will make before the job is failed for good. */
  maxAttempts: number;
  /** The most recent failure, kept while a job waits for its next attempt. */
  failure: JobFailure | null;
  createdAt: Date;
  updatedAt: Date;
  /** When the first attempt started work, not when the latest one did. */
  startedAt: Date | null;
  /** Set once the job reaches any terminal status, not only success. */
  completedAt: Date | null;
}

export interface CreateJobInput {
  projectId: string;
  kind: JobKind;
  targetId: string;
  /** How many steps the job reports; defaults to one. */
  totalSteps?: number;
  maxAttempts?: number;
}

export interface JobFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createJob(input: CreateJobInput, deps: JobFactoryDeps): Job {
  const now = deps.clock.now();

  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    kind: requireOneOf('kind', input.kind, JOB_KINDS),
    targetId: requireText('targetId', input.targetId, 200),
    status: 'queued',
    progress: { completed: 0, total: requireStepCount(input.totalSteps ?? 1), step: null },
    attempt: 1,
    maxAttempts: requireAttemptCount(input.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS),
    failure: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  };
}

export interface AdvanceJobInput {
  status: JobStatus;
  /** Steps finished once this transition is done; left alone when omitted. */
  completed?: number;
  /** What the job is doing now; `null` clears the step text. */
  step?: string | null;
}

/** Moves a job one step forward, recording what it is doing while it gets there. */
export function advanceJob(job: Job, input: AdvanceJobInput, deps: { clock: Clock }): Job {
  const status = requireOneOf('status', input.status, JOB_STATUSES);
  if (!NEXT_STATUSES[job.status].includes(status)) {
    throw new ConflictError(`A "${job.status}" job cannot move to "${status}"`, {
      jobId: job.id,
      status: job.status,
      expected: NEXT_STATUSES[job.status],
    });
  }

  const now = deps.clock.now();
  return {
    ...job,
    status,
    progress: mergeProgress(job, input),
    startedAt: job.startedAt ?? now,
    completedAt: status === 'complete' ? now : job.completedAt,
    updatedAt: now,
  };
}

export interface JobProgressInput {
  completed?: number;
  step?: string | null;
}

/** Updates progress within the current status, for a step that reports as it goes. */
export function reportJobProgress(job: Job, input: JobProgressInput, deps: { clock: Clock }): Job {
  requireActive(job, 'updated');

  return { ...job, progress: mergeProgress(job, input), updatedAt: deps.clock.now() };
}

export interface FailJobInput {
  code?: string;
  message: string;
  details?: Record<string, unknown>;
}

/** Ends a job for good, keeping the diagnostics that explain why. */
export function failJob(job: Job, input: FailJobInput, deps: { clock: Clock }): Job {
  requireActive(job, 'failed');
  const now = deps.clock.now();

  return { ...job, status: 'failed', failure: toFailure(input), completedAt: now, updatedAt: now };
}

/**
 * Sends a job back to the queue for another attempt.
 *
 * The failure that caused it is kept, so a job waiting to be retried can still
 * say what went wrong, and progress restarts because the next attempt does.
 */
export function retryJob(job: Job, input: FailJobInput, deps: { clock: Clock }): Job {
  requireActive(job, 'retried');
  if (job.attempt >= job.maxAttempts) {
    throw new ConflictError('A job that has used every attempt cannot be retried', {
      jobId: job.id,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
    });
  }

  return {
    ...job,
    status: 'queued',
    progress: { ...job.progress, completed: 0, step: null },
    attempt: job.attempt + 1,
    failure: toFailure(input),
    updatedAt: deps.clock.now(),
  };
}

export function cancelJob(job: Job, deps: { clock: Clock }): Job {
  requireActive(job, 'cancelled');
  const now = deps.clock.now();

  return { ...job, status: 'cancelled', completedAt: now, updatedAt: now };
}

/** True while a job may still change: everything short of a terminal status. */
export function isJobActive(job: Job): boolean {
  return (ACTIVE_JOB_STATUSES as readonly JobStatus[]).includes(job.status);
}

function mergeProgress(job: Job, input: JobProgressInput): JobProgress {
  const completed =
    input.completed === undefined
      ? job.progress.completed
      : requireNonNegativeInt('progress.completed', input.completed);

  if (completed > job.progress.total) {
    throw new ValidationError('A job cannot complete more steps than it has', {
      jobId: job.id,
      completed,
      total: job.progress.total,
    });
  }

  return {
    ...job.progress,
    completed,
    step:
      input.step === undefined
        ? job.progress.step
        : optionalText('progress.step', input.step, MAX_JOB_STEP_LENGTH),
  };
}

function toFailure(input: FailJobInput): JobFailure {
  return {
    code: requireText('failure.code', input.code ?? DEFAULT_JOB_FAILURE_CODE, 100),
    message: requireText('failure.message', input.message, MAX_JOB_FAILURE_MESSAGE_LENGTH),
    details: requireJsonObject('failure.details', input.details),
  };
}

function requireStepCount(total: number): number {
  if (!Number.isInteger(total) || total < 1 || total > MAX_JOB_STEPS) {
    throw new ValidationError(`totalSteps must be an integer between 1 and ${MAX_JOB_STEPS}`, {
      totalSteps: total,
    });
  }
  return total;
}

function requireAttemptCount(maxAttempts: number): number {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_JOB_ATTEMPTS) {
    throw new ValidationError(`maxAttempts must be an integer between 1 and ${MAX_JOB_ATTEMPTS}`, {
      maxAttempts,
    });
  }
  return maxAttempts;
}

function requireActive(job: Job, action: string): void {
  if (isJobActive(job)) return;

  throw new ConflictError(`A "${job.status}" job cannot be ${action}`, {
    jobId: job.id,
    status: job.status,
  });
}
