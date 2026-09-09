import { beforeEach, describe, expect, it } from 'vitest';

import { createProject, type Project } from '../project/project';
import { ProjectService } from '../project/project-service';
import { fixedClock } from '../shared/clock';
import { ConflictError, NotFoundError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  InMemoryJobEvents,
  InMemoryJobQueue,
  InMemoryJobRepository,
  InMemoryProjectRepository,
} from '../testing';
import { type Job } from './job';
import { JobService } from './job-service';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let projects: ProjectService;
let queue: InMemoryJobQueue;
let events: InMemoryJobEvents;
let jobs: JobService;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('job') };
  const projectRepo = new InMemoryProjectRepository();
  queue = new InMemoryJobQueue();
  events = new InMemoryJobEvents();

  projects = new ProjectService(projectRepo, deps);
  jobs = new JobService(new InMemoryJobRepository(), projectRepo, queue, events, deps);

  project = await projectRepo.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project-a') }),
  );
  otherProject = await projectRepo.insert(
    createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
  );
});

const enqueue = (targetId = 'generation-1', totalSteps = 3): Promise<Job> =>
  jobs.enqueue(project.id, { kind: 'generation', targetId, totalSteps });

describe('enqueueing work', () => {
  it('records the job before handing it to the queue', async () => {
    const job = await enqueue();

    expect(job).toMatchObject({ status: 'queued', kind: 'generation', targetId: 'generation-1' });
    expect(queue.enqueued.map((queued) => queued.id)).toEqual([job.id]);
    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({ id: job.id });
  });

  it('announces the job so a browser can pick it up immediately', async () => {
    const job = await enqueue();

    expect(events.published.map((published) => published.id)).toEqual([job.id]);
  });

  it('refuses to queue work in an archived project', async () => {
    await projects.archive(project.id);

    await expect(enqueue()).rejects.toThrow(ConflictError);
  });

  it('refuses to queue work in a project that does not exist', async () => {
    await expect(jobs.enqueue('missing', { kind: 'generation', targetId: 'g' })).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe('reading jobs back', () => {
  it('reads a job from another project as missing', async () => {
    const job = await enqueue();

    await expect(jobs.getById(otherProject.id, job.id)).rejects.toThrow(NotFoundError);
  });

  it('lists the jobs for one record so a reconnecting client finds its work', async () => {
    const job = await enqueue('generation-7');
    await enqueue('generation-8');

    const page = await jobs.listByProject(project.id, {
      kind: 'generation',
      targetId: 'generation-7',
    });

    expect(page.total).toBe(1);
    expect(page.items[0]?.id).toBe(job.id);
  });
});

describe('reporting progress', () => {
  it('publishes every state change', async () => {
    const job = await enqueue();

    await jobs.advance(project.id, job.id, { status: 'preparing_context', step: 'Preparing' });
    await jobs.advance(project.id, job.id, { status: 'running', completed: 1, step: 'Generating' });
    const ticked = await jobs.reportProgress(project.id, job.id, { completed: 2 });

    expect(ticked.progress).toEqual({ completed: 2, total: 3, step: 'Generating' });
    expect(events.published.map((published) => published.status)).toEqual([
      'queued',
      'preparing_context',
      'running',
      'running',
    ]);
  });
});

describe('failure and retry', () => {
  it('returns a job to the queue when the worker says the queue will retry it', async () => {
    const job = await enqueue();
    await jobs.advance(project.id, job.id, { status: 'running' });

    const retried = await jobs.retry(project.id, job.id, {
      code: 'timeout',
      message: 'provider timed out',
    });

    expect(retried).toMatchObject({ status: 'queued', attempt: 2 });
    expect(retried.failure?.code).toBe('timeout');
  });

  it('ends the job when the last attempt fails', async () => {
    const job = await enqueue();
    await jobs.advance(project.id, job.id, { status: 'running' });

    const failed = await jobs.fail(project.id, job.id, { message: 'provider unavailable' });

    expect(failed.status).toBe('failed');
    await expect(jobs.advance(project.id, job.id, { status: 'complete' })).rejects.toThrow(
      ConflictError,
    );
  });
});

describe('cancellation', () => {
  it('cancels the record and drops the job from the queue', async () => {
    const job = await enqueue();

    const cancelled = await jobs.cancel(project.id, job.id);

    expect(cancelled.status).toBe('cancelled');
    expect(queue.removed.map((removed) => removed.id)).toEqual([job.id]);
  });

  it('cancels the active job for a record', async () => {
    const job = await enqueue('generation-9');

    const cancelled = await jobs.cancelForTarget(project.id, 'generation', 'generation-9');

    expect(cancelled?.id).toBe(job.id);
    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('reports no job to cancel once the work has finished', async () => {
    const job = await enqueue('generation-9');
    await jobs.advance(project.id, job.id, { status: 'running' });
    await jobs.advance(project.id, job.id, { status: 'complete', completed: 3 });

    await expect(
      jobs.cancelForTarget(project.id, 'generation', 'generation-9'),
    ).resolves.toBeNull();
  });
});
