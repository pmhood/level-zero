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
  type AiCheckContext,
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
  InMemoryReviewDecisionRepository,
} from '@level-zero/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { createConsistencyScanJobHandler } from './consistency-scan-job';

const silentLogger = { log: () => {}, error: () => {} };
const deps = { clock: systemClock, ids: uuidIdGenerator };

/**
 * An AI context that proposes nothing and judges nothing, standing in for a
 * scan of a project the registered AI checks have no material to work on.
 */
function idleAiContext(): AiCheckContext {
  return {
    retrieve: () => Promise.resolve([]),
    judge: () => Promise.reject(new Error('nothing should be judged here')),
  };
}

/** An AI context whose provider is down, standing in for a failed judgement. */
function brokenAiContext(): AiCheckContext {
  return {
    retrieve: () => Promise.resolve([]),
    judge: () => Promise.reject(new Error('anthropic is unreachable')),
  };
}

/** An AI context that judges the two entities it is given to be in tension. */
function judgingAiContext(generationId: string): AiCheckContext {
  return {
    retrieve: () => Promise.resolve([]),
    judge: (request) =>
      Promise.resolve({
        generationId,
        output: JSON.stringify({
          findings: [
            {
              severity: 'warning',
              summary:
                'The two accounts of the flood read as though they describe one event twice.',
              evidence: request.contextEntityIds.map((entityId) => ({
                entityId,
                where: 'Description',
                states: 'dates the flood differently',
              })),
            },
          ],
        }),
      }),
  };
}

/** Two lore entries, which is the least the lore check will read. */
async function insertLore(): Promise<void> {
  await entityRepo.insert(
    createEntity(
      {
        projectId: project.id,
        type: 'lore',
        name: 'The Flood',
        description: 'The flood came in the ninth year of the Deep.',
      },
      deps,
    ),
  );
  await entityRepo.insert(
    createEntity(
      {
        projectId: project.id,
        type: 'lore',
        name: 'The Drowning',
        description: 'The waters rose in the eleventh year of the Deep.',
      },
      deps,
    ),
  );
}

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
  consistency = new ConsistencyScanService(
    entityRepo,
    prototypeVersionRepo,
    new InMemoryReviewDecisionRepository(),
    findings,
    jobs,
    deps,
  );

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
      Promise.resolve({
        projectId: project.id,
        entities: [],
        prototypeVersions: [],
        sectionDecisions: [],
      }),
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

    await createConsistencyScanJobHandler({
      jobs,
      consistency,
      aiContext: idleAiContext,
      logger: silentLogger,
    })(delivery(job));

    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({
      status: 'complete',
      progress: { completed: CONSISTENCY_SCAN_JOB_STEPS.length, step: null },
    });
    await expect(findings.listByProject(project.id)).resolves.toMatchObject({ total: 0 });
  });

  it('commits deterministic findings before the AI step runs', async () => {
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

    await createConsistencyScanJobHandler({
      jobs,
      consistency,
      aiContext: idleAiContext,
      logger: silentLogger,
    })(delivery(job));

    const { items } = await findings.listByProject(project.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ checkId: 'stale-prototype-pin', origin: 'deterministic' });
  });

  it('does nothing for a job cancelled before it was picked up', async () => {
    const job = await queueScanJob();
    await jobs.cancel(project.id, job.id);

    await createConsistencyScanJobHandler({
      jobs,
      consistency,
      aiContext: idleAiContext,
      logger: silentLogger,
    })(delivery(job));

    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('fails the job and re-throws, so a broken scan surfaces rather than disappearing', async () => {
    const job = await queueScanJob();
    const handle = createConsistencyScanJobHandler({
      jobs,
      consistency: brokenConsistency(),
      aiContext: idleAiContext,
      logger: silentLogger,
    });

    await expect(handle(delivery(job))).rejects.toThrow('postgres is down');
    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'consistency_scan_error', message: 'postgres is down' },
    });
  });

  it('writes AI findings with the judgement behind them, and no deterministic one carries a generation', async () => {
    await insertLore();
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

    await createConsistencyScanJobHandler({
      jobs,
      consistency,
      aiContext: () => judgingAiContext('generation-7'),
      logger: silentLogger,
    })(delivery(job));

    const { items } = await findings.listByProject(project.id);
    const ai = items.filter((finding) => finding.origin === 'ai_assisted');
    const deterministic = items.filter((finding) => finding.origin === 'deterministic');

    expect(ai).toHaveLength(1);
    expect(ai[0]).toMatchObject({ checkId: 'lore-contradiction', generationId: 'generation-7' });
    expect(deterministic).toHaveLength(1);
    expect(deterministic[0]?.generationId).toBeNull();
  });

  it('keeps the deterministic findings a scan proved when the AI pass cannot run', async () => {
    await insertLore();
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

    const handle = createConsistencyScanJobHandler({
      jobs,
      consistency,
      aiContext: brokenAiContext,
      logger: silentLogger,
    });

    await expect(handle(delivery(job))).rejects.toThrow('anthropic is unreachable');
    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({ status: 'failed' });

    const { items } = await findings.listByProject(project.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ origin: 'deterministic', status: 'open' });
  });

  it('records a retry rather than a failure while the queue will try again', async () => {
    const job = await queueScanJob();
    const handle = createConsistencyScanJobHandler({
      jobs,
      consistency: brokenConsistency(),
      aiContext: idleAiContext,
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
