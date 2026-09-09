import {
  JobService,
  createProject,
  fixedClock,
  sequentialIdGenerator,
  type Job,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryJobEvents,
  InMemoryJobQueue,
  InMemoryJobRepository,
  InMemoryProjectRepository,
} from '@level-zero/domain/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { type AddressInfo } from 'node:net';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { JOB_EVENTS } from '../infrastructure/queue.module';
import { JobsController } from './jobs.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let app: INestApplication;
let jobs: JobService;
let baseUrl: string;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projects = new InMemoryProjectRepository();
  const events = new InMemoryJobEvents();

  jobs = new JobService(
    new InMemoryJobRepository(),
    projects,
    new InMemoryJobQueue(),
    events,
    deps,
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [JobsController],
    providers: [
      { provide: JobService, useValue: jobs },
      { provide: JOB_EVENTS, useValue: events },
      { provide: APP_FILTER, useClass: DomainExceptionFilter },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

  project = await projects.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project-a') }),
  );
  otherProject = await projects.insert(
    createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
  );
});

afterEach(async () => {
  await app.close();
});

const http = () => request(app.getHttpServer());

const jobsUrl = () => `/api/projects/${project.id}/jobs`;

const enqueue = (targetId = 'generation-1'): Promise<Job> =>
  jobs.enqueue(project.id, { kind: 'generation', targetId, totalSteps: 3 });

describe('reading jobs', () => {
  it('reports the step a job is on, which is what a progress bar shows', async () => {
    const job = await enqueue();
    await jobs.advance(project.id, job.id, { status: 'running', completed: 1, step: 'Generating' });

    const response = await http().get(`${jobsUrl()}/${job.id}`).expect(200);

    expect(response.body).toMatchObject({
      status: 'running',
      progress: { completed: 1, total: 3, step: 'Generating' },
      attempt: 1,
      maxAttempts: 3,
    });
  });

  it('finds the job for one generation, which is how a reload reconnects', async () => {
    const job = await enqueue('generation-7');
    await enqueue('generation-8');

    const response = await http()
      .get(jobsUrl())
      .query({ kind: 'generation', targetId: 'generation-7' })
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0].id).toBe(job.id);
  });

  it('filters by status so a client can list only what is still running', async () => {
    const finished = await enqueue('generation-7');
    await jobs.advance(project.id, finished.id, { status: 'running' });
    await jobs.advance(project.id, finished.id, { status: 'complete', completed: 3 });
    await enqueue('generation-8');

    const response = await http().get(jobsUrl()).query({ status: 'queued,running' }).expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0].targetId).toBe('generation-8');
  });

  it('never reads a job through another project', async () => {
    const job = await enqueue();

    await http().get(`/api/projects/${otherProject.id}/jobs/${job.id}`).expect(404);
  });
});

describe('streaming job changes', () => {
  it('pushes each state change to a connected client', async () => {
    const connection = new AbortController();
    const response = await fetch(`${baseUrl}${jobsUrl()}/stream`, { signal: connection.signal });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const nextMatching = await readEvents(response, connection);

    const job = await enqueue();
    await jobs.advance(project.id, job.id, { status: 'running', completed: 1, step: 'Generating' });

    const running = await nextMatching(
      (delivered) => delivered.id === job.id && delivered.status === 'running',
    );
    expect(running.progress).toMatchObject({ completed: 1, total: 3, step: 'Generating' });
  });

  it('does not stream another project jobs', async () => {
    const connection = new AbortController();
    const response = await fetch(`${baseUrl}${jobsUrl()}/stream`, { signal: connection.signal });
    const nextMatching = await readEvents(response, connection);

    await jobs.enqueue(otherProject.id, { kind: 'generation', targetId: 'generation-2' });
    const mine = await enqueue();

    const first = await nextMatching((job) => job.id !== undefined);
    expect(first.id).toBe(mine.id);
  });
});

/**
 * Reads the SSE body until a job matching the predicate arrives, then closes the
 * connection. Heartbeats and partial frames are skipped.
 */
async function readEvents(
  response: Response,
  connection: AbortController,
): Promise<(predicate: (job: Job) => boolean) => Promise<Job>> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('the stream had no body');

  const decoder = new TextDecoder();
  let buffered = '';

  // The handler subscribes as the response headers are flushed; give it the
  // tick it needs before anything is published.
  await new Promise((resolve) => setTimeout(resolve, 50));

  return async (predicate) => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) throw new Error('the stream closed before the job arrived');

        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split('\n');
        buffered = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const job = JSON.parse(line.slice('data: '.length)) as Job;
          if (job.id !== undefined && predicate(job)) return job;
        }
      }
    } finally {
      connection.abort();
    }
  };
}
