import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityService } from '../activity/activity-service';
import { AssetService } from '../asset/asset-service';
import { DocumentService } from '../document/document-service';
import { EntityService } from '../entity/entity-service';
import { GenerationService } from '../generation/generation-service';
import { type JobQueue } from '../job/job-queue';
import { JobService } from '../job/job-service';
import { createProject, type Project } from '../project/project';
import { EntityRelationshipService } from '../relationship/entity-relationship-service';
import { LineageService } from '../relationship/lineage-service';
import { fixedClock } from '../shared/clock';
import { sequentialIdGenerator } from '../shared/id';
import {
  InMemoryActivityRepository,
  InMemoryAssetRepository,
  InMemoryEmbeddingProvider,
  InMemoryEntityRelationshipRepository,
  InMemoryEntityRepository,
  InMemoryEntityVersionRepository,
  InMemoryGenerationRepository,
  InMemoryJobEvents,
  InMemoryJobQueue,
  InMemoryJobRepository,
  InMemoryObjectStorageProvider,
  InMemoryProjectRepository,
  InMemorySearchDocumentRepository,
} from '../testing';
import { EntityVersionService } from '../version/entity-version-service';
import { type SearchDocumentRepository } from './search-repository';
import { SearchIndexService } from './search-index-service';
import { SearchService } from './search-service';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

/** The vector space these tests reason in: dimensions a reader can name. */
const VOCABULARY = ['oxygen', 'breath', 'dive', 'trench', 'forest', 'canopy'];

let deps: { clock: typeof clock; ids: ReturnType<typeof sequentialIdGenerator> };
let documents: InMemorySearchDocumentRepository;
let entityRepo: InMemoryEntityRepository;
let projectRepo: InMemoryProjectRepository;
let assetRepo: InMemoryAssetRepository;
let generationRepo: InMemoryGenerationRepository;
let embeddings: InMemoryEmbeddingProvider;
let activity: ActivityService;
let index: SearchIndexService;
let search: SearchService;
let entities: EntityService;
let versions: EntityVersionService;
let gddDocuments: DocumentService;
let assets: AssetService;
let generations: GenerationService;
let queue: InMemoryJobQueue;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  deps = { clock, ids: sequentialIdGenerator('id') };
  projectRepo = new InMemoryProjectRepository();
  entityRepo = new InMemoryEntityRepository();
  assetRepo = new InMemoryAssetRepository();
  generationRepo = new InMemoryGenerationRepository();
  const versionRepo = new InMemoryEntityVersionRepository();
  const relationshipRepo = new InMemoryEntityRelationshipRepository();

  documents = new InMemorySearchDocumentRepository();
  activity = new ActivityService(new InMemoryActivityRepository(), deps);
  queue = new InMemoryJobQueue();
  embeddings = new InMemoryEmbeddingProvider(VOCABULARY);
  const jobs = new JobService(
    new InMemoryJobRepository(),
    projectRepo,
    queue,
    new InMemoryJobEvents(),
    deps,
  );

  index = new SearchIndexService(
    documents,
    entityRepo,
    assetRepo,
    generationRepo,
    embeddings,
    jobs,
    deps,
  );
  search = new SearchService(documents, embeddings);

  entities = new EntityService(entityRepo, projectRepo, activity, deps, index);
  versions = new EntityVersionService(versionRepo, entityRepo, activity, deps, index);
  gddDocuments = new DocumentService(entities, versions);
  assets = new AssetService(
    assetRepo,
    projectRepo,
    new InMemoryObjectStorageProvider(),
    activity,
    deps,
    index,
  );
  generations = new GenerationService(
    generationRepo,
    projectRepo,
    entityRepo,
    assetRepo,
    new LineageService(
      entities,
      new EntityRelationshipService(relationshipRepo, entityRepo, deps),
      activity,
    ),
    activity,
    deps,
    index,
  );

  project = await projectRepo.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project-a') }),
  );
  otherProject = await projectRepo.insert(
    createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
  );
});

/** Runs the work the `search_index` job would do, without a worker. */
async function runIndexJob(projectId: string = project.id): Promise<void> {
  await index.reindexProject(projectId);
  while ((await index.embedPending(projectId)) > 0) {
    // Drains every stale row, the way the worker's handler does.
  }
}

describe('following canonical changes', () => {
  it('makes a new entity findable by the words in it', async () => {
    await entities.create(project.id, {
      type: 'mechanic',
      name: 'Oxygen Drain',
      description: 'The breath meter falls while the diver is away from air.',
    });

    const { items } = await search.search(project.id, { text: 'breath' });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sourceType: 'entity',
      entityType: 'mechanic',
      title: 'Oxygen Drain',
    });
  });

  it('follows an edit, so the old wording stops matching and the new one starts', async () => {
    const mechanic = await entities.create(project.id, {
      type: 'mechanic',
      name: 'Oxygen Drain',
      description: 'The breath meter falls.',
    });

    await entities.update(project.id, mechanic.id, { name: 'Pressure Drain' });

    await expect(search.search(project.id, { text: 'oxygen' })).resolves.toMatchObject({
      total: 0,
    });
    await expect(search.search(project.id, { text: 'pressure' })).resolves.toMatchObject({
      total: 1,
    });
  });

  it('indexes a document by its body, not only its title', async () => {
    await gddDocuments.create(project.id, {
      name: 'Vertical slice GDD',
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Traversal' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'The trench is crossed on a single tank.' }],
          },
        ],
      },
    });

    const { items } = await search.search(project.id, { text: 'trench' });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ entityType: 'document', title: 'Vertical slice GDD' });
  });

  it('records the version a hit was indexed at', async () => {
    const mechanic = await entities.create(project.id, { type: 'mechanic', name: 'Oxygen Drain' });
    const version = await versions.commit(project.id, mechanic.id, { reason: 'manual' });

    const { items } = await search.search(project.id, { text: 'oxygen' });

    expect(items[0]?.sourceVersionId).toBe(version.id);
  });

  it('indexes assets and generations alongside entities', async () => {
    await assets.upload(project.id, {
      kind: 'image',
      filename: 'trench-concept.png',
      mimeType: 'image/png',
      content: Buffer.from('pretend png bytes'),
    });
    await generations.record(project.id, {
      capability: 'image.generate',
      prompt: 'A bioluminescent trench, seen from a diver',
    });

    const { items } = await search.search(project.id, { text: 'trench' });

    expect(items.map((item) => item.sourceType).sort()).toEqual(['asset', 'generation']);
  });

  it('hides archived material unless it is asked for', async () => {
    const idea = await entities.create(project.id, { type: 'idea', name: 'Oxygen tether' });
    await entities.archive(project.id, idea.id);

    await expect(search.search(project.id, { text: 'oxygen' })).resolves.toMatchObject({
      total: 0,
    });
    await expect(
      search.search(project.id, { text: 'oxygen', includeArchived: true }),
    ).resolves.toMatchObject({ total: 1 });
  });

  it('queues one index job for a burst of changes rather than one per change', async () => {
    await entities.create(project.id, { type: 'idea', name: 'Oxygen tether' });
    await entities.create(project.id, { type: 'idea', name: 'Trench beacon' });

    const indexJobs = queue.enqueued.filter((job) => job.kind === 'search_index');

    expect(indexJobs).toHaveLength(1);
    expect(indexJobs[0]?.targetId).toBe(project.id);
  });
});

describe('project isolation', () => {
  it('never returns another project\u2019s material', async () => {
    await entities.create(project.id, { type: 'mechanic', name: 'Oxygen Drain' });
    await entities.create(otherProject.id, { type: 'mechanic', name: 'Oxygen Bloom' });

    const mine = await search.search(project.id, { text: 'oxygen' });

    expect(mine.items.map((item) => item.title)).toEqual(['Oxygen Drain']);
    expect(mine.items.every((item) => item.projectId === project.id)).toBe(true);
  });

  it('keeps semantic retrieval inside the project too', async () => {
    await entities.create(project.id, {
      type: 'mechanic',
      name: 'Oxygen Drain',
      description: 'oxygen breath dive',
    });
    await entities.create(otherProject.id, {
      type: 'mechanic',
      name: 'Sky Oxygen',
      description: 'oxygen breath dive',
    });
    await runIndexJob(project.id);
    await runIndexJob(otherProject.id);

    const mine = await search.searchSemantic(project.id, { text: 'oxygen breath' });

    expect(mine.items.map((item) => item.title)).toEqual(['Oxygen Drain']);
  });
});

describe('filtering a mixed result list', () => {
  beforeEach(async () => {
    await entities.create(project.id, {
      type: 'mechanic',
      name: 'Oxygen Drain',
      tags: ['core-loop'],
      status: 'active',
    });
    await entities.create(project.id, { type: 'character', name: 'Oxygen-scarred diver' });
    await assets.upload(project.id, {
      kind: 'image',
      filename: 'oxygen-gauge.png',
      mimeType: 'image/png',
      content: Buffer.from('bytes'),
    });
  });

  it('scopes to one entity type, which is what a tool page sends', async () => {
    const { items } = await search.search(project.id, {
      text: 'oxygen',
      entityTypes: ['mechanic'],
    });

    expect(items.map((item) => item.title)).toEqual(['Oxygen Drain']);
  });

  it('scopes to one kind of record', async () => {
    const { items } = await search.search(project.id, {
      text: 'oxygen',
      sourceTypes: ['asset'],
    });

    expect(items.map((item) => item.title)).toEqual(['oxygen-gauge.png']);
  });

  it('filters by tag across types', async () => {
    const { items } = await search.search(project.id, { text: 'oxygen', tags: ['CORE-LOOP'] });

    expect(items.map((item) => item.title)).toEqual(['Oxygen Drain']);
  });

  it('filters by status', async () => {
    const { items } = await search.search(project.id, { text: 'oxygen', statuses: ['draft'] });

    expect(items.map((item) => item.title)).toEqual(['Oxygen-scarred diver']);
  });
});

describe('semantic retrieval', () => {
  beforeEach(async () => {
    await entities.create(project.id, {
      type: 'mechanic',
      name: 'Breath economy',
      description: 'oxygen breath dive dive trench',
    });
    await entities.create(project.id, {
      type: 'location',
      name: 'Canopy walk',
      description: 'forest canopy canopy dive',
    });
    await runIndexJob();
  });

  it('ranks by meaning rather than by the words that were typed', async () => {
    const { items } = await search.searchSemantic(project.id, { text: 'oxygen dive' });

    expect(items.map((item) => item.title)).toEqual(['Breath economy', 'Canopy walk']);
    expect(items[0]?.score).toBeGreaterThan(items[1]?.score ?? 1);
  });

  it('leaves material with nothing in common out, rather than ranking the whole project', async () => {
    const { items } = await search.searchSemantic(project.id, { text: 'forest' });

    expect(items.map((item) => item.title)).toEqual(['Canopy walk']);
  });

  it('applies the same filters as a keyword search', async () => {
    const { items } = await search.searchSemantic(project.id, {
      text: 'oxygen dive',
      entityTypes: ['location'],
    });

    expect(items.map((item) => item.title)).toEqual(['Canopy walk']);
  });

  it('rejects a semantic query with nothing to search for', async () => {
    await expect(search.searchSemantic(project.id, { text: '  ' })).rejects.toThrow(
      /needs something to search for/,
    );
  });
});

describe('keeping vectors current', () => {
  it('re-embeds a record whose text changed, and leaves the rest alone', async () => {
    const mechanic = await entities.create(project.id, {
      type: 'mechanic',
      name: 'Breath economy',
      description: 'oxygen breath',
    });
    await entities.create(project.id, { type: 'location', name: 'Canopy walk' });
    await runIndexJob();

    await entities.update(project.id, mechanic.id, { description: 'forest canopy' });

    const stale = await documents.listStale(project.id, 10);
    expect(stale.map((document) => document.sourceId)).toEqual([mechanic.id]);

    expect(await index.embedPending(project.id)).toBe(1);
    expect(await index.embedPending(project.id)).toBe(0);

    const { items } = await search.searchSemantic(project.id, { text: 'forest canopy' });
    expect(items[0]?.title).toBe('Breath economy');
  });

  it('rebuilds material that predates the index', async () => {
    // The same store, written by a service with no indexer wired to it.
    const unindexed = new EntityService(entityRepo, projectRepo, activity, {
      clock,
      ids: sequentialIdGenerator('legacy'),
    });
    await unindexed.create(project.id, { type: 'idea', name: 'Oxygen tether' });

    await expect(search.search(project.id, { text: 'oxygen' })).resolves.toMatchObject({
      total: 0,
    });

    await index.reindexProject(project.id);

    await expect(search.search(project.id, { text: 'oxygen' })).resolves.toMatchObject({
      total: 1,
    });
  });
});

describe('isolating index failures from the write that caused them', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    vi.spyOn(console, 'error').mockImplementation((message: unknown) => {
      logged.push(String(message));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** An index whose store is unreachable, standing in for Postgres being down. */
  function indexWithBrokenStore(): SearchIndexService {
    const store: SearchDocumentRepository = {
      upsert: () => Promise.reject(new Error('index store is down')),
      searchText: (projectId, filter) => documents.searchText(projectId, filter),
      searchSimilar: (projectId, embedding, model, filter) =>
        documents.searchSimilar(projectId, embedding, model, filter),
      listStale: (projectId, limit) => documents.listStale(projectId, limit),
      saveEmbedding: (projectId, documentId, input) =>
        documents.saveEmbedding(projectId, documentId, input),
    };

    return buildIndex(store, jobsWith(queue));
  }

  /** An index that can write text but cannot queue work, i.e. Redis is down. */
  function indexWithBrokenQueue(): SearchIndexService {
    const broken: JobQueue = {
      enqueue: () => Promise.reject(new Error('redis is unreachable')),
      remove: () => Promise.resolve(),
    };

    return buildIndex(documents, jobsWith(broken));
  }

  function jobsWith(jobQueue: JobQueue): JobService {
    return new JobService(
      new InMemoryJobRepository(),
      projectRepo,
      jobQueue,
      new InMemoryJobEvents(),
      deps,
    );
  }

  function buildIndex(store: SearchDocumentRepository, jobs: JobService): SearchIndexService {
    return new SearchIndexService(
      store,
      entityRepo,
      assetRepo,
      generationRepo,
      embeddings,
      jobs,
      deps,
    );
  }

  it('still creates the entity, and still records the activity, when the index store is down', async () => {
    const service = new EntityService(
      entityRepo,
      projectRepo,
      activity,
      deps,
      indexWithBrokenStore(),
    );

    const idea = await service.create(project.id, { type: 'idea', name: 'Oxygen tether' });

    // The canonical write is what the caller asked for, and it happened.
    await expect(service.getById(project.id, idea.id)).resolves.toMatchObject({
      name: 'Oxygen tether',
    });
    // The feed is part of the act, not derived from it, so a broken index must
    // not cost an entry either — which is why indexing runs last.
    const feed = await activity.listByProject(project.id);
    expect(feed.items.map((entry) => entry.summary)).toContain('Oxygen tether created');
    expect(logged.join('\n')).toContain('[search] could not index entity');
  });

  it('still creates the entity when the queue is unreachable', async () => {
    const service = new EntityService(
      entityRepo,
      projectRepo,
      activity,
      deps,
      indexWithBrokenQueue(),
    );

    const idea = await service.create(project.id, { type: 'idea', name: 'Oxygen tether' });

    await expect(service.getById(project.id, idea.id)).resolves.toMatchObject({
      name: 'Oxygen tether',
    });
    // The text was written before the queue was asked for anything, so the
    // entity is already findable; only its vector is waiting.
    await expect(search.search(project.id, { text: 'oxygen' })).resolves.toMatchObject({
      total: 1,
    });
  });

  it('still archives an entity in an archived project, which queues no work', async () => {
    const idea = await entities.create(project.id, { type: 'idea', name: 'Oxygen tether' });
    await projectRepo.save({
      ...(await projectRepo.findById(project.id))!,
      status: 'archived',
    });

    await expect(entities.archive(project.id, idea.id)).resolves.toMatchObject({
      status: 'archived',
    });
  });

  it('loses nothing: a later index pass picks up what the failure missed', async () => {
    const service = new EntityService(
      entityRepo,
      projectRepo,
      activity,
      deps,
      indexWithBrokenStore(),
    );
    await service.create(project.id, { type: 'idea', name: 'Oxygen tether' });

    await expect(search.search(project.id, { text: 'oxygen' })).resolves.toMatchObject({
      total: 0,
    });

    await index.reindexProject(project.id);

    await expect(search.search(project.id, { text: 'oxygen' })).resolves.toMatchObject({
      total: 1,
    });
  });
});
