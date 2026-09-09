import { type JobDelivery } from '@level-zero/database';
import {
  ActivityService,
  EntityService,
  JobService,
  SEARCH_INDEX_JOB_STEPS,
  SearchIndexService,
  SearchService,
  createProject,
  systemClock,
  uuidIdGenerator,
  type Job,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryActivityRepository,
  InMemoryAssetRepository,
  InMemoryEmbeddingProvider,
  InMemoryEntityRepository,
  InMemoryGenerationRepository,
  InMemoryJobEvents,
  InMemoryJobQueue,
  InMemoryJobRepository,
  InMemoryProjectRepository,
  InMemorySearchDocumentRepository,
} from '@level-zero/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { createSearchIndexJobHandler } from './search-index-job';

const silentLogger = { log: () => {}, error: () => {} };

/** The vector space this test reasons in: dimensions a reader can name. */
const VOCABULARY = ['oxygen', 'dive', 'trench', 'forest', 'canopy'];

let jobs: JobService;
let search: SearchIndexService;
let queries: SearchService;
let entities: EntityService;
let project: Project;

beforeEach(async () => {
  const deps = { clock: systemClock, ids: uuidIdGenerator };
  const projectRepo = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const documents = new InMemorySearchDocumentRepository();
  const embeddings = new InMemoryEmbeddingProvider(VOCABULARY);

  jobs = new JobService(
    new InMemoryJobRepository(),
    projectRepo,
    new InMemoryJobQueue(),
    new InMemoryJobEvents(),
    deps,
  );
  search = new SearchIndexService(
    documents,
    entityRepo,
    new InMemoryAssetRepository(),
    new InMemoryGenerationRepository(),
    embeddings,
    jobs,
    deps,
  );
  queries = new SearchService(documents, embeddings);
  // Deliberately unindexed on write, so the job has something to catch up on.
  entities = new EntityService(
    entityRepo,
    projectRepo,
    new ActivityService(new InMemoryActivityRepository(), deps),
    deps,
  );

  project = await projectRepo.insert(
    createProject({ name: 'Deep Fathom' }, { clock: systemClock, ids: uuidIdGenerator }),
  );
});

function delivery(job: Job, overrides: Partial<JobDelivery> = {}): JobDelivery {
  return {
    jobId: job.id,
    projectId: job.projectId,
    kind: 'search_index',
    attempt: 1,
    willRetry: false,
    ...overrides,
  };
}

/** An index whose first step throws, standing in for a database that is down. */
function brokenIndex(): SearchIndexService {
  return {
    reindexProject: () => Promise.reject(new Error('postgres is down')),
    embedPending: () => Promise.resolve(0),
  } as unknown as SearchIndexService;
}

async function queueIndexJob(): Promise<Job> {
  return jobs.enqueue(project.id, {
    kind: 'search_index',
    targetId: project.id,
    totalSteps: SEARCH_INDEX_JOB_STEPS.length,
  });
}

describe('running a search-index job', () => {
  it('indexes the project and builds its vectors, reporting each step', async () => {
    await entities.create(project.id, {
      type: 'mechanic',
      name: 'Oxygen Drain',
      description: 'oxygen dive',
    });
    const job = await queueIndexJob();

    await createSearchIndexJobHandler({ jobs, search, logger: silentLogger })(delivery(job));

    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({
      status: 'complete',
      progress: { completed: SEARCH_INDEX_JOB_STEPS.length, step: null },
    });
    await expect(queries.search(project.id, { text: 'oxygen' })).resolves.toMatchObject({
      total: 1,
    });
    await expect(
      queries.searchSemantic(project.id, { text: 'oxygen dive' }),
    ).resolves.toMatchObject({ total: 1 });
  });

  it('does nothing for a job cancelled before it was picked up', async () => {
    const job = await queueIndexJob();
    await jobs.cancel(project.id, job.id);

    await createSearchIndexJobHandler({ jobs, search, logger: silentLogger })(delivery(job));

    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('fails the job and re-throws, so the queue can decide about another attempt', async () => {
    const job = await queueIndexJob();
    const handle = createSearchIndexJobHandler({
      jobs,
      search: brokenIndex(),
      logger: silentLogger,
    });

    await expect(handle(delivery(job))).rejects.toThrow('postgres is down');
    await expect(jobs.getById(project.id, job.id)).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'search_index_error', message: 'postgres is down' },
    });
  });

  it('records a retry rather than a failure while the queue will try again', async () => {
    const job = await queueIndexJob();
    const handle = createSearchIndexJobHandler({
      jobs,
      search: brokenIndex(),
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
