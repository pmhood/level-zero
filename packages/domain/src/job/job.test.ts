import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { ConflictError, ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  advanceJob,
  cancelJob,
  createJob,
  failJob,
  isJobActive,
  reportJobProgress,
  retryJob,
  type Job,
} from './job';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const deps = { clock, ids: sequentialIdGenerator('job') };

function queued(overrides: Partial<Job> = {}): Job {
  return {
    ...createJob(
      { projectId: 'project-1', kind: 'generation', targetId: 'generation-1', totalSteps: 3 },
      deps,
    ),
    ...overrides,
  };
}

describe('creating a job', () => {
  it('starts queued on its first attempt with nothing done', () => {
    expect(queued()).toMatchObject({
      projectId: 'project-1',
      kind: 'generation',
      targetId: 'generation-1',
      status: 'queued',
      progress: { completed: 0, total: 3, step: null },
      attempt: 1,
      maxAttempts: 3,
      failure: null,
      startedAt: null,
      completedAt: null,
    });
  });

  it('rejects a step count that cannot be reported', () => {
    expect(() =>
      createJob({ projectId: 'p', kind: 'generation', targetId: 't', totalSteps: 0 }, deps),
    ).toThrow(ValidationError);
  });
});

describe('advancing a job', () => {
  it('carries the step text a UI shows and counts finished steps', () => {
    const preparing = advanceJob(
      queued(),
      { status: 'preparing_context', step: 'Preparing context' },
      deps,
    );
    const running = advanceJob(
      preparing,
      { status: 'running', completed: 1, step: 'Generating' },
      deps,
    );

    expect(running.progress).toEqual({ completed: 1, total: 3, step: 'Generating' });
    expect(running.startedAt).toEqual(clock.now());
  });

  it('records when work first started, not when the latest step did', () => {
    const started = advanceJob(queued(), { status: 'preparing_context' }, deps);
    const later = fixedClock('2026-03-01T09:05:00.000Z');

    const running = advanceJob(started, { status: 'running' }, { clock: later });

    expect(running.startedAt).toEqual(clock.now());
    expect(running.updatedAt).toEqual(later.now());
  });

  it('refuses to skip backwards or repeat a status', () => {
    const running = advanceJob(queued(), { status: 'running' }, deps);

    expect(() => advanceJob(running, { status: 'preparing_context' }, deps)).toThrow(ConflictError);
    expect(() => advanceJob(running, { status: 'running' }, deps)).toThrow(ConflictError);
  });

  it('closes the record when it completes', () => {
    const running = advanceJob(queued(), { status: 'running' }, deps);

    const complete = advanceJob(running, { status: 'complete', completed: 3, step: null }, deps);

    expect(complete.completedAt).toEqual(clock.now());
    expect(isJobActive(complete)).toBe(false);
    expect(() => advanceJob(complete, { status: 'complete' }, deps)).toThrow(ConflictError);
  });

  it('refuses to report more steps than the job has', () => {
    expect(() => advanceJob(queued(), { status: 'running', completed: 4 }, deps)).toThrow(
      ValidationError,
    );
  });
});

describe('progress within a step', () => {
  it('updates the count and the text without changing status', () => {
    const running = advanceJob(queued(), { status: 'running', step: 'Generating' }, deps);

    const ticked = reportJobProgress(running, { completed: 2, step: 'Generating 2 of 3' }, deps);

    expect(ticked.status).toBe('running');
    expect(ticked.progress).toEqual({ completed: 2, total: 3, step: 'Generating 2 of 3' });
  });

  it('is refused once the job has finished', () => {
    const cancelled = cancelJob(queued(), deps);

    expect(() => reportJobProgress(cancelled, { completed: 1 }, deps)).toThrow(ConflictError);
  });
});

describe('retries', () => {
  it('returns the job to the queue on the next attempt, keeping the failure', () => {
    const running = advanceJob(queued(), { status: 'running', completed: 1 }, deps);

    const retried = retryJob(running, { code: 'timeout', message: 'provider timed out' }, deps);

    expect(retried).toMatchObject({
      status: 'queued',
      attempt: 2,
      progress: { completed: 0, total: 3, step: null },
      failure: { code: 'timeout', message: 'provider timed out', details: {} },
    });
    expect(retried.completedAt).toBeNull();
  });

  it('refuses a retry once every attempt is used', () => {
    const last = queued({ attempt: 3, maxAttempts: 3 });

    expect(() => retryJob(last, { message: 'nope' }, deps)).toThrow(ConflictError);
  });

  it('fails for good with diagnostics attached', () => {
    const failed = failJob(
      queued({ attempt: 3 }),
      { code: 'provider_error', message: 'HTTP 500', details: { status: 500 } },
      deps,
    );

    expect(failed).toMatchObject({
      status: 'failed',
      failure: { code: 'provider_error', message: 'HTTP 500', details: { status: 500 } },
    });
    expect(failed.completedAt).toEqual(clock.now());
  });
});

describe('cancellation', () => {
  it('closes an in-flight job', () => {
    const running = advanceJob(queued(), { status: 'running' }, deps);

    const cancelled = cancelJob(running, deps);

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.completedAt).toEqual(clock.now());
  });

  it('cannot cancel a job that already finished', () => {
    const complete = advanceJob(
      advanceJob(queued(), { status: 'running' }, deps),
      { status: 'complete' },
      deps,
    );

    expect(() => cancelJob(complete, deps)).toThrow(ConflictError);
  });
});
