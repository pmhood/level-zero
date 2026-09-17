import {
  ActivityService,
  AssetService,
  EntityService,
  JobService,
  SearchIndexService,
  SearchService,
  createProject,
  fixedClock,
  sequentialIdGenerator,
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
  InMemoryObjectStorageProvider,
  InMemoryProjectRepository,
  InMemorySearchDocumentRepository,
} from '@level-zero/domain/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { SearchController } from './search.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

/** The vector space these tests reason in: dimensions a reader can name. */
const VOCABULARY = ['oxygen', 'dive', 'trench', 'forest', 'canopy'];

let app: INestApplication;
let entities: EntityService;
let assets: AssetService;
let index: SearchIndexService;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projects = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const assetRepo = new InMemoryAssetRepository();
  const documents = new InMemorySearchDocumentRepository();
  const embeddings = new InMemoryEmbeddingProvider(VOCABULARY);

  const jobs = new JobService(
    new InMemoryJobRepository(),
    projects,
    new InMemoryJobQueue(),
    new InMemoryJobEvents(),
    deps,
  );
  index = new SearchIndexService(
    documents,
    entityRepo,
    assetRepo,
    new InMemoryGenerationRepository(),
    embeddings,
    jobs,
    deps,
  );
  const activity = new ActivityService(new InMemoryActivityRepository(), deps);
  entities = new EntityService(entityRepo, projects, activity, deps, index);
  assets = new AssetService(
    assetRepo,
    projects,
    new InMemoryObjectStorageProvider(),
    activity,
    deps,
    index,
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [SearchController],
    providers: [
      { provide: SearchService, useValue: new SearchService(documents, embeddings) },
      { provide: SearchIndexService, useValue: index },
      { provide: APP_FILTER, useClass: DomainExceptionFilter },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

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
const searchUrl = (projectId = project.id) => `/api/projects/${projectId}/search`;

async function seed(): Promise<void> {
  await entities.create(project.id, {
    type: 'mechanic',
    name: 'Oxygen Drain',
    description: 'oxygen dive',
    tags: ['Core-Loop'],
  });
  await entities.create(project.id, { type: 'character', name: 'Oxygen-scarred diver' });
  await assets.upload(project.id, {
    kind: 'image',
    filename: 'oxygen-gauge.png',
    mimeType: 'image/png',
    content: Buffer.from('bytes'),
  });
}

describe('GET /projects/:projectId/search', () => {
  it('returns a mixed list carrying the type and project behind each hit', async () => {
    await seed();

    const response = await http().get(searchUrl()).query({ q: 'oxygen' }).expect(200);

    expect(response.body.total).toBe(3);
    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectId: project.id,
          sourceType: 'entity',
          entityType: 'mechanic',
          title: 'Oxygen Drain',
        }),
        expect.objectContaining({ sourceType: 'asset', title: 'oxygen-gauge.png' }),
      ]),
    );
  });

  it('scopes to one entity type, which is what a tool page sends', async () => {
    await seed();

    const response = await http()
      .get(searchUrl())
      .query({ q: 'oxygen', entityType: 'mechanic' })
      .expect(200);

    expect(response.body.items.map((item: { title: string }) => item.title)).toEqual([
      'Oxygen Drain',
    ]);
  });

  it('filters by source type, tag and status together', async () => {
    await seed();

    const response = await http()
      .get(searchUrl())
      .query({ q: 'oxygen', sourceType: 'entity', tag: 'core-loop', status: 'draft' })
      .expect(200);

    expect(response.body.items.map((item: { title: string }) => item.title)).toEqual([
      'Oxygen Drain',
    ]);
  });

  it('filters by when the source itself last changed', async () => {
    await seed();

    // Everything above was written at the fixed clock's 2026-03-01.
    const after = await http()
      .get(searchUrl())
      .query({ q: 'oxygen', updatedAfter: '2026-01-01' })
      .expect(200);
    const before = await http()
      .get(searchUrl())
      .query({ q: 'oxygen', updatedBefore: '2026-01-01' })
      .expect(200);

    expect(after.body.total).toBe(3);
    expect(before.body.total).toBe(0);
  });

  it('answers a semantic query from the embeddings', async () => {
    await seed();
    await index.reindexProject(project.id);
    while ((await index.embedPending(project.id)) > 0) {
      // Drains every stale row, the way the worker's handler does.
    }

    const response = await http()
      .get(searchUrl())
      .query({ q: 'oxygen dive', mode: 'semantic' })
      .expect(200);

    expect(response.body.items[0]).toMatchObject({ title: 'Oxygen Drain' });
    expect(response.body.items[0].score).toBeGreaterThan(0);
  });

  it('never reaches another project’s material', async () => {
    await seed();
    await entities.create(otherProject.id, { type: 'mechanic', name: 'Oxygen Bloom' });

    const response = await http()
      .get(searchUrl(otherProject.id))
      .query({ q: 'oxygen' })
      .expect(200);

    expect(response.body.items.map((item: { title: string }) => item.title)).toEqual([
      'Oxygen Bloom',
    ]);
  });

  it('rejects a semantic query with nothing to search for', async () => {
    await http().get(searchUrl()).query({ mode: 'semantic' }).expect(400);
  });

  it('rejects an unknown mode', async () => {
    await http().get(searchUrl()).query({ q: 'oxygen', mode: 'psychic' }).expect(400);
  });
});

describe('POST /projects/:projectId/search/reindex', () => {
  it('queues an index pass and answers with the job running it', async () => {
    const response = await http().post(`${searchUrl()}/reindex`).expect(201);

    expect(response.body).toMatchObject({
      kind: 'search_index',
      targetId: project.id,
      status: 'queued',
    });
  });

  it('returns the pass already running rather than queueing a second one', async () => {
    const first = await http().post(`${searchUrl()}/reindex`).expect(201);
    const second = await http().post(`${searchUrl()}/reindex`).expect(201);

    expect(second.body.id).toBe(first.body.id);
  });

  it('reports an unknown project as not found', async () => {
    await http()
      .post(`${searchUrl('11111111-1111-4111-8111-111111111111')}/reindex`)
      .expect(404);
  });
});
