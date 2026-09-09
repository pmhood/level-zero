import {
  AssetService,
  EntityRelationshipService,
  EntityService,
  GenerationService,
  LineageService,
  createProject,
  fixedClock,
  sequentialIdGenerator,
  type Asset,
  type Entity,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryAssetRepository,
  InMemoryEntityRelationshipRepository,
  InMemoryEntityRepository,
  InMemoryGenerationRepository,
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
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projects = new InMemoryProjectRepository();
  const entities = new InMemoryEntityRepository();
  const relationships = new InMemoryEntityRelationshipRepository();
  const assets = new InMemoryAssetRepository();

  entityService = new EntityService(entities, projects, deps);
  assetService = new AssetService(assets, projects, new InMemoryObjectStorageProvider(), deps);
  const generationService = new GenerationService(
    new InMemoryGenerationRepository(),
    projects,
    entities,
    assets,
    new LineageService(entityService, new EntityRelationshipService(relationships, entities, deps)),
    deps,
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [GenerationsController],
    providers: [
      { provide: GenerationService, useValue: generationService },
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
