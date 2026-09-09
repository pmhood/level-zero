import {
  JobService,
  NotFoundError,
  ProjectService,
  systemClock,
  uuidIdGenerator,
  type Job,
  type Project,
} from '@level-zero/domain';
import { InMemoryJobEvents, InMemoryJobQueue } from '@level-zero/domain/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DatabaseClient } from '../postgres/client';
import { connectTestDatabase, truncateDomainTables } from '../testing/test-database';
import { DrizzleJobRepository } from './job-repository';
import { DrizzleProjectRepository } from './project-repository';

/**
 * Drizzle wraps driver errors, so the Postgres SQLSTATE lives on the cause
 * chain rather than in the message.
 */
async function expectPostgresError(operation: Promise<unknown>, code: string): Promise<void> {
  let thrown: unknown;
  try {
    await operation;
  } catch (error) {
    thrown = error;
  }

  const codes: string[] = [];
  for (let error = thrown; error instanceof Error; error = error.cause) {
    const candidate = (error as Error & { code?: string }).code;
    if (candidate) codes.push(candidate);
  }

  expect(thrown, 'expected the statement to be rejected').toBeInstanceOf(Error);
  expect(codes).toContain(code);
}

const deps = { clock: systemClock, ids: uuidIdGenerator };

let client: DatabaseClient;
let jobRepo: DrizzleJobRepository;
let projects: ProjectService;
let jobs: JobService;
let project: Project;

beforeAll(() => {
  client = connectTestDatabase();
  const projectRepo = new DrizzleProjectRepository(client.db);
  jobRepo = new DrizzleJobRepository(client.db);

  projects = new ProjectService(projectRepo, deps);
  jobs = new JobService(
    jobRepo,
    projectRepo,
    new InMemoryJobQueue(),
    new InMemoryJobEvents(),
    deps,
  );
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await truncateDomainTables(client);
  project = await projects.create({ name: 'Deep Fathom' });
});

const enqueue = (targetId = uuidIdGenerator.next(), totalSteps = 3): Promise<Job> =>
  jobs.enqueue(project.id, { kind: 'generation', targetId, totalSteps });

describe('job records', () => {
  it('round trips progress, attempts and timestamps', async () => {
    const job = await enqueue();
    await jobs.advance(project.id, job.id, { status: 'preparing_context', step: 'Preparing' });
    await jobs.advance(project.id, job.id, { status: 'running', completed: 1, step: 'Generating' });

    const stored = await jobRepo.findById(project.id, job.id);

    expect(stored).toMatchObject({
      kind: 'generation',
      status: 'running',
      progress: { completed: 1, total: 3, step: 'Generating' },
      attempt: 1,
      maxAttempts: 3,
    });
    expect(stored?.startedAt).toBeInstanceOf(Date);
    expect(stored?.completedAt).toBeNull();
  });

  it('keeps the failure that sent a job back to the queue', async () => {
    const job = await enqueue();
    await jobs.advance(project.id, job.id, { status: 'running' });

    await jobs.retry(project.id, job.id, { code: 'timeout', message: 'provider timed out' });

    await expect(jobRepo.findById(project.id, job.id)).resolves.toMatchObject({
      status: 'queued',
      attempt: 2,
      failure: { code: 'timeout', message: 'provider timed out', details: {} },
    });
  });

  it('finds the active job for one generation, which is how a reload reconnects', async () => {
    const target = uuidIdGenerator.next();
    const job = await enqueue(target);
    await enqueue();

    const page = await jobs.listByProject(project.id, { kind: 'generation', targetId: target });

    expect(page.total).toBe(1);
    expect(page.items[0]?.id).toBe(job.id);
  });

  it('is removed with the project it belongs to', async () => {
    await enqueue();

    await truncateDomainTables(client);

    await expect(jobs.listByProject(project.id)).resolves.toMatchObject({ total: 0 });
  });
});

describe('guarantees the database enforces', () => {
  it('refuses a terminal job without a completion time', async () => {
    const job = await enqueue();

    await expectPostgresError(
      jobRepo.save({ ...job, status: 'complete', completedAt: null }),
      '23514',
    );
  });

  it('refuses progress beyond the steps the job has', async () => {
    const job = await enqueue();

    await expectPostgresError(
      jobRepo.save({ ...job, progress: { ...job.progress, completed: 9 } }),
      '23514',
    );
  });

  it('refuses an attempt past the allowance', async () => {
    const job = await enqueue();

    await expectPostgresError(jobRepo.save({ ...job, attempt: 4, maxAttempts: 3 }), '23514');
  });
});

describe('project scoping', () => {
  it('never reads a job through the wrong project', async () => {
    const other = await projects.create({ name: 'Sky Wreck' });
    const job = await enqueue();

    await expect(jobRepo.findById(other.id, job.id)).resolves.toBeNull();
    await expect(jobs.getById(other.id, job.id)).rejects.toThrow(NotFoundError);
  });
});
