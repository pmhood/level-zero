import { ContextResolver } from '@level-zero/ai';
import {
  ActivityService,
  AssetService,
  EntityRelationshipService,
  EntityService,
  GenerationService,
  JobService,
  LineageService,
  createProject,
  fixedClock,
  sequentialIdGenerator,
  type Asset,
  type Entity,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryActivityRepository,
  InMemoryAssetRepository,
  InMemoryEntityRelationshipRepository,
  InMemoryEntityRepository,
  InMemoryGenerationRepository,
  InMemoryJobEvents,
  InMemoryJobQueue,
  InMemoryJobRepository,
  InMemoryObjectStorageProvider,
  InMemoryProjectRepository,
} from '@level-zero/domain/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { GenerationsController } from './generations.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let app: INestApplication;
let entityService: EntityService;
let assetService: AssetService;
let jobService: JobService;
let relationshipService: EntityRelationshipService;
let queue: InMemoryJobQueue;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projects = new InMemoryProjectRepository();
  const entities = new InMemoryEntityRepository();
  const relationships = new InMemoryEntityRelationshipRepository();
  const assets = new InMemoryAssetRepository();

  const activity = new ActivityService(new InMemoryActivityRepository(), deps);
  entityService = new EntityService(entities, projects, activity, deps);
  relationshipService = new EntityRelationshipService(relationships, entities, deps);
  assetService = new AssetService(assets, projects, new InMemoryObjectStorageProvider(), deps);
  const generationRepository = new InMemoryGenerationRepository();
  const generationService = new GenerationService(
    generationRepository,
    projects,
    entities,
    assets,
    new LineageService(entityService, relationshipService, activity),
    activity,
    deps,
  );

  queue = new InMemoryJobQueue();
  jobService = new JobService(
    new InMemoryJobRepository(),
    projects,
    queue,
    new InMemoryJobEvents(),
    deps,
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [GenerationsController],
    providers: [
      { provide: GenerationService, useValue: generationService },
      { provide: JobService, useValue: jobService },
      {
        provide: ContextResolver,
        useValue: new ContextResolver(
          projects,
          entities,
          relationships,
          assets,
          generationRepository,
        ),
      },
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

const generationsUrl = () => `/api/projects/${project.id}/generations`;

const prompt = 'a drowned cathedral lit from below';

async function image(filename: string): Promise<Asset> {
  return assetService.upload(project.id, {
    kind: 'image',
    filename,
    mimeType: 'image/png',
    content: Buffer.from(filename),
  });
}

async function pillar(): Promise<Entity> {
  return entityService.create(project.id, { type: 'design_pillar', name: 'Oppressive scale' });
}

/** Records a generation and dispatches it, the state a provider result lands in. */
async function running(body: Record<string, unknown> = {}): Promise<string> {
  const created = await http()
    .post(generationsUrl())
    .send({ capability: 'image.generate', prompt, ...body })
    .expect(201);

  await http()
    .post(`${generationsUrl()}/${created.body.id}/dispatch`)
    .send({ provider: 'openai', model: 'gpt-image-1' })
    .expect(201);

  return created.body.id;
}

describe('recording a generation', () => {
  it('records the request as queued, before a provider is known', async () => {
    const response = await http()
      .post(generationsUrl())
      .send({ capability: 'image.generate', prompt, parameters: { steps: 30 } })
      .expect(201);

    expect(response.body).toMatchObject({
      projectId: project.id,
      capability: 'image.generate',
      prompt,
      parameters: { steps: 30 },
      status: 'queued',
      provider: null,
      model: null,
    });
  });

  it('queues the work and returns without waiting for a provider', async () => {
    const response = await http()
      .post(generationsUrl())
      .send({ capability: 'image.generate', prompt })
      .expect(201);

    const jobs = await jobService.listByProject(project.id, {
      kind: 'generation',
      targetId: response.body.id,
    });

    expect(jobs.items[0]).toMatchObject({
      status: 'queued',
      progress: { completed: 0, total: 3, step: null },
    });
    expect(queue.enqueued.map((job) => job.targetId)).toEqual([response.body.id]);
  });

  it('rejects a capability no provider could serve', async () => {
    await http().post(generationsUrl()).send({ capability: 'image.enhance', prompt }).expect(400);
  });

  it('returns 404 when the project does not exist', async () => {
    await http()
      .post('/api/projects/missing/generations')
      .send({ capability: 'image.generate', prompt })
      .expect(404);
  });
});

describe('resolving project context for a request', () => {
  it('records what the user pointed at as named inputs and what the graph added as context', async () => {
    const diver = await entityService.create(project.id, {
      type: 'character',
      name: 'The Diver',
    });
    const trench = await entityService.create(project.id, {
      type: 'location',
      name: 'Cradle Trench',
    });
    await relationshipService.link(project.id, {
      sourceEntityId: diver.id,
      targetEntityId: trench.id,
      relation: 'appears_in',
    });
    const plate = await image('palette.png');

    const response = await http()
      .post(generationsUrl())
      .send({
        capability: 'image.generate',
        prompt,
        context: { selectedEntityIds: [diver.id], assetIds: [plate.id] },
      })
      .expect(201);

    expect(response.body).toMatchObject({
      inputEntityIds: [diver.id],
      contextEntityIds: [trench.id],
      inputAssetIds: [plate.id],
    });
  });

  it('stores the assembled context, saying why each object was included', async () => {
    const diver = await entityService.create(project.id, {
      type: 'character',
      name: 'The Diver',
    });

    const response = await http()
      .post(generationsUrl())
      .send({ capability: 'image.generate', prompt, context: { selectedEntityIds: [diver.id] } })
      .expect(201);

    expect(response.body.resolvedContext).toMatchObject({
      project: { id: project.id, name: 'Deep Fathom' },
      instruction: prompt,
      entities: [{ id: diver.id, name: 'The Diver', source: 'selected', distance: 0 }],
    });
  });

  it('leaves the context null when the caller named its own inputs', async () => {
    const pillarEntity = await pillar();

    const response = await http()
      .post(generationsUrl())
      .send({ capability: 'image.generate', prompt, inputEntityIds: [pillarEntity.id] })
      .expect(201);

    expect(response.body).toMatchObject({
      inputEntityIds: [pillarEntity.id],
      resolvedContext: null,
    });
  });

  it('reports an entity from another project as not found', async () => {
    const outsider = await entityService.create(otherProject.id, {
      type: 'character',
      name: 'Sky Captain',
    });

    await http()
      .post(generationsUrl())
      .send({ capability: 'image.generate', prompt, context: { selectedEntityIds: [outsider.id] } })
      .expect(404);
  });

  it('rejects a walk deeper than the resolver allows', async () => {
    await http()
      .post(generationsUrl())
      .send({ capability: 'image.generate', prompt, context: { relatedDepth: 9 } })
      .expect(400);
  });
});

describe('moving a generation forward', () => {
  it('records the provider, then the output assets', async () => {
    const generationId = await running();
    const output = await image('cathedral.png');

    const completed = await http()
      .post(`${generationsUrl()}/${generationId}/complete`)
      .send({ outputAssetIds: [output.id], seed: '42' })
      .expect(201);

    expect(completed.body).toMatchObject({
      status: 'complete',
      provider: 'openai',
      model: 'gpt-image-1',
      outputAssetIds: [output.id],
      seed: '42',
    });
  });

  it('returns 409 when a generation is completed twice', async () => {
    const generationId = await running();
    await http()
      .post(`${generationsUrl()}/${generationId}/complete`)
      .send({ outputAssetIds: [] })
      .expect(201);

    const response = await http()
      .post(`${generationsUrl()}/${generationId}/complete`)
      .send({ outputAssetIds: [] })
      .expect(409);

    expect(response.body).toMatchObject({ error: 'conflict' });
  });

  it('keeps the request when a generation fails', async () => {
    const generationId = await running({ parameters: { steps: 30 } });

    const failed = await http()
      .post(`${generationsUrl()}/${generationId}/fail`)
      .send({ code: 'timeout', message: 'Provider did not respond', details: { waited: 60 } })
      .expect(201);

    expect(failed.body).toMatchObject({
      status: 'failed',
      prompt,
      parameters: { steps: 30 },
      failure: { code: 'timeout', message: 'Provider did not respond', details: { waited: 60 } },
    });
  });

  it('cancels a queued generation', async () => {
    const created = await http()
      .post(generationsUrl())
      .send({ capability: 'image.generate', prompt })
      .expect(201);

    const cancelled = await http()
      .post(`${generationsUrl()}/${created.body.id}/cancel`)
      .expect(201);

    expect(cancelled.body).toMatchObject({ status: 'cancelled', failure: null });
  });

  it('cancels the job running a generation, so the queue stops carrying it', async () => {
    const created = await http()
      .post(generationsUrl())
      .send({ capability: 'image.generate', prompt })
      .expect(201);

    await http().post(`${generationsUrl()}/${created.body.id}/cancel`).expect(201);

    const jobs = await jobService.listByProject(project.id, { targetId: created.body.id });
    expect(jobs.items[0]?.status).toBe('cancelled');
    expect(queue.removed.map((job) => job.targetId)).toEqual([created.body.id]);
  });
});

describe('inspecting provenance', () => {
  it('explains a generated image: provider, model, prompt, inputs, context and parent', async () => {
    const context = await pillar();
    const first = await running();
    await http().post(`${generationsUrl()}/${first}/fail`).send({ message: 'timeout' }).expect(201);

    const generationId = await running({
      parameters: { steps: 30 },
      contextEntityIds: [context.id],
      parentGenerationId: first,
    });
    const output = await image('cathedral.png');
    await http()
      .post(`${generationsUrl()}/${generationId}/complete`)
      .send({ outputAssetIds: [output.id] })
      .expect(201);

    const provenance = await http()
      .get(`${generationsUrl()}/${generationId}/provenance`)
      .expect(200);

    expect(provenance.body.generation).toMatchObject({
      provider: 'openai',
      model: 'gpt-image-1',
      prompt,
      parameters: { steps: 30 },
    });
    expect(provenance.body.contextEntities.map((entity: Entity) => entity.id)).toEqual([
      context.id,
    ]);
    expect(provenance.body.outputAssets.map((asset: Asset) => asset.id)).toEqual([output.id]);
    expect(provenance.body.parent.id).toBe(first);
  });

  it('finds the generation behind an output asset', async () => {
    const generationId = await running();
    const output = await image('cathedral.png');
    await http()
      .post(`${generationsUrl()}/${generationId}/complete`)
      .send({ outputAssetIds: [output.id] })
      .expect(201);

    const response = await http()
      .get(generationsUrl())
      .query({ outputAssetId: output.id })
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0].id).toBe(generationId);
  });

  it('filters by status', async () => {
    await running();
    const cancelled = await http()
      .post(generationsUrl())
      .send({ capability: 'image.generate', prompt })
      .expect(201);
    await http().post(`${generationsUrl()}/${cancelled.body.id}/cancel`).expect(201);

    const response = await http().get(generationsUrl()).query({ status: 'running' }).expect(200);

    expect(response.body.total).toBe(1);
  });

  it('never reads a generation through another project', async () => {
    const generationId = await running();

    await http()
      .get(`/api/projects/${otherProject.id}/generations/${generationId}/provenance`)
      .expect(404);
  });
});
