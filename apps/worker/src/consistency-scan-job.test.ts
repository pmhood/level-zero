import { type JobDelivery } from '@level-zero/database';
import {
  CONSISTENCY_SCAN_JOB_STEPS,
  ConsistencyScanService,
  JobService,
  createEntity,
  createProject,
  createPrototypeVersion,
  systemClock,
  uuidIdGenerator,
  type Job,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryEntityRepository,
  InMemoryFindingRepository,
  InMemoryJobEvents,
  InMemoryJobQueue,
  InMemoryJobRepository,
  InMemoryProjectRepository,
  InMemoryPrototypeVersionRepository,
} from '@level-zero/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { createConsistencyScanJobHandler } from './consistency-scan-job';

const silentLogger = { log: () => {}, error: () => {} };
const deps = { clock: systemClock, ids: uuidIdGenerator };

let jobs: JobService;
let findings: InMemoryFindingRepository;
let entityRepo: InMemoryEntityRepository;
let prototypeVersionRepo: InMemoryPrototypeVersionRepository;
let consistency: ConsistencyScanService;
let project: Project;

beforeEach(async () => {
  const projectRepo = new InMemoryProjectRepository();
  entityRepo = new InMemoryEntityRepository();
  prototypeVersionRepo = new InMemoryPrototypeVersionRepository();
  findings = new InMemoryFindingRepository();

  jobs = new JobService(
    new InMemoryJobRepository(),
    projectRepo,
    new InMemoryJobQueue(),
    new InMemoryJobEvents(),
    deps,
  );
  consistency = new ConsistencyScanService(entityRepo, prototypeVersionRepo, findings, jobs, deps);

  project = await projectRepo.insert(createProject({ name: 'Deep Fathom' }, deps));
});

function delivery(job: Job, overrides: Partial<JobDelivery> = {}): JobDelivery {
  return {
    jobId: job.id,
    projectId: job.projectId,
    kind: 'consistency_scan',
    attempt: 1,
    willRetry: false,
    ...overrides,
  };
}

/** A scan runner whose deterministic pass throws, standing in for a database that is down. */
function brokenConsistency(): ConsistencyScanService {
  return {
    loadProjectFacts: () =>
      Promise.resolve({ projectId: project.id, entities: [], prototypeVersions: [] }),
    runDeterministicChecks: () => Promise.reject(new Error('postgres is down')),
  } as unknown as ConsistencyScanService;
}

async function queueScanJob(): Promise<Job> {
  return jobs.enqueue(project.id, {
    kind: 'consistency_scan',
    targetId: project.id,
    totalSteps: CONSISTENCY_SCAN_JOB_STEPS.length,
  });
}

describe('running a consistency-scan job', () => {
  it('runs the deterministic pass and reports all three steps to completion', async () => {
    // Nothing pins an entity, so the one registered check finds nothing —
    // this proves the job completes cleanly rather than that it finds a bug.
    const job = await queueScanJob();

    await createConsistencyScanJobHandler({ jobs, consistency, logger: silentLogger })(
      delivery(job),
    );

    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({
      status: 'complete',
      progress: { completed: CONSISTENCY_SCAN_JOB_STEPS.length, step: null },
    });
    await expect(findings.listByProject(project.id)).resolves.toMatchObject({ total: 0 });
  });

  it('commits deterministic findings before the (currently empty) AI step runs', async () => {
    const diver = await entityRepo.insert({
      ...createEntity({ projectId: project.id, type: 'character', name: 'The Diver' }, deps),
      currentVersionId: 'version-2',
    });
    await prototypeVersionRepo.insert(
      createPrototypeVersion(
        {
          projectId: project.id,
          prototypeId: 'prototype-1',
          versionNumber: 1,
          members: [{ entityId: diver.id, entityVersionId: 'version-1' }],
        },
        deps,
      ),
    );
    const job = await queueScanJob();

    await createConsistencyScanJobHandler({ jobs, consistency, logger: silentLogger })(
      delivery(job),
    );

    const { items } = await findings.listByProject(project.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ checkId: 'stale-prototype-pin', origin: 'deterministic' });
  });

  it('does nothing for a job cancelled before it was picked up', async () => {
    const job = await queueScanJob();
    await jobs.cancel(project.id, job.id);

    await createConsistencyScanJobHandler({ jobs, consistency, logger: silentLogger })(
      delivery(job),
    );

    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('fails the job and re-throws, so a broken scan surfaces rather than disappearing', async () => {
    const job = await queueScanJob();
    const handle = createConsistencyScanJobHandler({
      jobs,
      consistency: brokenConsistency(),
      logger: silentLogger,
    });

    await expect(handle(delivery(job))).rejects.toThrow('postgres is down');
    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'consistency_scan_error', message: 'postgres is down' },
    });
  });

  it('records a retry rather than a failure while the queue will try again', async () => {
    const job = await queueScanJob();
    const handle = createConsistencyScanJobHandler({
      jobs,
      consistency: brokenConsistency(),
      logger: silentLogger,
    });

    await expect(handle(delivery(job, { willRetry: true }))).rejects.toThrow('postgres is down');
    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({
      status: 'queued',
      attempt: 2,
      failure: { message: 'postgres is down' },
    });
  });
});
