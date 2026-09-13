import {
  AssetLibraryService,
  AssetService,
  ProjectService,
  assetReferenceData,
  completeGeneration,
  createEntity,
  createEntityRelationship,
  createGeneration,
  createProject,
  dispatchGeneration,
  fixedClock,
  sequentialIdGenerator,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryAssetLibraryReadModel,
  InMemoryAssetMarkRepository,
  InMemoryAssetRepository,
  InMemoryAssetSelectionRepository,
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
import { ProjectsController } from '../projects/projects.controller';
import { AssetsController } from './assets.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let app: INestApplication;
let projectService: ProjectService;
let generations: InMemoryGenerationRepository;
let entities: InMemoryEntityRepository;
let relationships: InMemoryEntityRelationshipRepository;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projects = new InMemoryProjectRepository();
  const assets = new InMemoryAssetRepository();
  const storage = new InMemoryObjectStorageProvider();
  generations = new InMemoryGenerationRepository();
  const marks = new InMemoryAssetMarkRepository();
  const selections = new InMemoryAssetSelectionRepository();
  entities = new InMemoryEntityRepository();
  relationships = new InMemoryEntityRelationshipRepository();
  projectService = new ProjectService(projects, deps);
  const assetService = new AssetService(assets, projects, storage, deps);
  const libraryService = new AssetLibraryService(
    new InMemoryAssetLibraryReadModel(
      assets,
      generations,
      marks,
      selections,
      entities,
      relationships,
    ),
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [ProjectsController, AssetsController],
    providers: [
      { provide: ProjectService, useValue: projectService },
      { provide: AssetService, useValue: assetService },
      { provide: AssetLibraryService, useValue: libraryService },
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

const pngBase64 = Buffer.from('pretend png bytes').toString('base64');

describe('uploading an asset', () => {
  it('stores metadata scoped to the project', async () => {
    const response = await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({
        kind: 'image',
        filename: 'kael.png',
        mimeType: 'image/png',
        contentBase64: pngBase64,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      projectId: project.id,
      kind: 'image',
      filename: 'kael.png',
      mimeType: 'image/png',
      variant: 'source',
      status: 'active',
    });
    expect(response.body.byteSize).toBe(Buffer.byteLength('pretend png bytes'));
  });

  it('rejects an unknown asset kind', async () => {
    await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({ kind: 'spreadsheet', filename: 'x', mimeType: 'x', contentBase64: pngBase64 })
      .expect(400);
  });

  it('rejects content that is not valid base64', async () => {
    await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({ kind: 'image', filename: 'x', mimeType: 'x', contentBase64: 'not base64 at all!!' })
      .expect(400);
  });

  it('returns 404 when the project does not exist', async () => {
    await http()
      .post('/api/projects/missing/assets')
      .send({ kind: 'image', filename: 'x', mimeType: 'image/png', contentBase64: pngBase64 })
      .expect(404);
  });

  it('returns 409 when the project is archived', async () => {
    await projectService.archive(project.id);

    const response = await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({ kind: 'image', filename: 'x', mimeType: 'image/png', contentBase64: pngBase64 })
      .expect(409);

    expect(response.body).toMatchObject({ error: 'conflict' });
  });
});

describe('retrieving an asset', () => {
  it('reads metadata back through its project', async () => {
    const created = await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({
        kind: 'image',
        filename: 'kael.png',
        mimeType: 'image/png',
        contentBase64: pngBase64,
      })
      .expect(201);

    const response = await http()
      .get(`/api/projects/${project.id}/assets/${created.body.id}`)
      .expect(200);

    expect(response.body.filename).toBe('kael.png');
  });

  it('returns 404 when read through another project', async () => {
    const created = await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({
        kind: 'image',
        filename: 'kael.png',
        mimeType: 'image/png',
        contentBase64: pngBase64,
      })
      .expect(201);

    await http().get(`/api/projects/${otherProject.id}/assets/${created.body.id}`).expect(404);
  });

  it('resolves a safe url', async () => {
    const created = await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({
        kind: 'image',
        filename: 'kael.png',
        mimeType: 'image/png',
        contentBase64: pngBase64,
      })
      .expect(201);

    const response = await http()
      .get(`/api/projects/${project.id}/assets/${created.body.id}/url`)
      .expect(200);

    expect(response.body.url).toContain(created.body.storageKey);
  });

  it('streams the exact uploaded bytes back with the recorded content type', async () => {
    const created = await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({
        kind: 'image',
        filename: 'kael.png',
        mimeType: 'image/png',
        contentBase64: pngBase64,
      })
      .expect(201);

    const response = await http()
      .get(`/api/projects/${project.id}/assets/${created.body.id}/content`)
      .expect(200);

    expect(response.headers['content-type']).toContain('image/png');
    expect(response.body).toEqual(Buffer.from('pretend png bytes'));
  });

  it('never lists another project assets', async () => {
    await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({
        kind: 'image',
        filename: 'kael.png',
        mimeType: 'image/png',
        contentBase64: pngBase64,
      })
      .expect(201);

    const response = await http().get(`/api/projects/${otherProject.id}/assets`).expect(200);

    expect(response.body.total).toBe(0);
  });
});

describe('sort, mime-family and date-range query params', () => {
  it('sorts by the requested field and direction', async () => {
    await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({
        kind: 'image',
        filename: 'zebra.png',
        mimeType: 'image/png',
        contentBase64: pngBase64,
      })
      .expect(201);
    await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({
        kind: 'image',
        filename: 'apple.png',
        mimeType: 'image/png',
        contentBase64: pngBase64,
      })
      .expect(201);

    const response = await http()
      .get(`/api/projects/${project.id}/assets`)
      .query({ sortBy: 'filename', sortDirection: 'asc' })
      .expect(200);

    expect(response.body.items.map((asset: { filename: string }) => asset.filename)).toEqual([
      'apple.png',
      'zebra.png',
    ]);
  });

  it('rejects an unknown sort field', async () => {
    await http()
      .get(`/api/projects/${project.id}/assets`)
      .query({ sortBy: 'relevance' })
      .expect(400);
  });

  it('rejects an unknown sort direction', async () => {
    await http()
      .get(`/api/projects/${project.id}/assets`)
      .query({ sortDirection: 'sideways' })
      .expect(400);
  });

  it('narrows by mime family, not by kind', async () => {
    await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({ kind: 'image', filename: 'a.png', mimeType: 'image/png', contentBase64: pngBase64 })
      .expect(201);
    await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({
        kind: 'export',
        filename: 'b.mp4',
        mimeType: 'video/mp4',
        contentBase64: pngBase64,
      })
      .expect(201);

    const response = await http()
      .get(`/api/projects/${project.id}/assets`)
      .query({ mimeFamily: 'video' })
      .expect(200);

    expect(response.body.items.map((asset: { filename: string }) => asset.filename)).toEqual([
      'b.mp4',
    ]);
  });

  it('narrows by createdAfter and createdBefore', async () => {
    await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({ kind: 'image', filename: 'a.png', mimeType: 'image/png', contentBase64: pngBase64 })
      .expect(201);

    const before = await http()
      .get(`/api/projects/${project.id}/assets`)
      .query({ createdBefore: '2026-01-01T00:00:00.000Z' })
      .expect(200);
    expect(before.body.total).toBe(0);

    const after = await http()
      .get(`/api/projects/${project.id}/assets`)
      .query({ createdAfter: '2026-01-01T00:00:00.000Z' })
      .expect(200);
    expect(after.body.total).toBe(1);
  });

  it('rejects a malformed date', async () => {
    await http()
      .get(`/api/projects/${project.id}/assets`)
      .query({ createdAfter: 'not a date' })
      .expect(400);
  });
});

describe('archiving and restoring an asset', () => {
  it('archives an asset and hides it from the default listing', async () => {
    const created = await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({
        kind: 'image',
        filename: 'kael.png',
        mimeType: 'image/png',
        contentBase64: pngBase64,
      })
      .expect(201);

    await http().post(`/api/projects/${project.id}/assets/${created.body.id}/archive`).expect(201);

    const listed = await http().get(`/api/projects/${project.id}/assets`).expect(200);
    expect(listed.body.total).toBe(0);

    const restored = await http()
      .post(`/api/projects/${project.id}/assets/${created.body.id}/restore`)
      .expect(201);
    expect(restored.body.status).toBe('active');
  });

  it('refuses to archive an asset through another project', async () => {
    const created = await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({
        kind: 'image',
        filename: 'kael.png',
        mimeType: 'image/png',
        contentBase64: pngBase64,
      })
      .expect(201);

    await http()
      .post(`/api/projects/${otherProject.id}/assets/${created.body.id}/archive`)
      .expect(404);
  });
});

describe('asset library summaries', () => {
  async function uploadAsset(filename: string): Promise<string> {
    const created = await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({ kind: 'image', filename, mimeType: 'image/png', contentBase64: pngBase64 })
      .expect(201);
    return created.body.id as string;
  }

  async function recordGeneration(outputAssetId: string): Promise<string> {
    const deps = { clock, ids: sequentialIdGenerator('generation') };
    let generation = createGeneration(
      { projectId: project.id, capability: 'image.generate', prompt: 'a diver' },
      deps,
    );
    generation = dispatchGeneration(generation, { provider: 'anthropic', model: 'claude' }, deps);
    generation = completeGeneration(generation, { outputAssetIds: [outputAssetId] }, deps);
    await generations.insert(generation);
    return generation.id;
  }

  it('does not include summaries without ?summary=true', async () => {
    await uploadAsset('kael.png');

    const response = await http().get(`/api/projects/${project.id}/assets`).expect(200);

    expect(response.body.summaries).toBeUndefined();
  });

  it('reports an uploaded asset as imported', async () => {
    const assetId = await uploadAsset('kael.png');

    const response = await http()
      .get(`/api/projects/${project.id}/assets`)
      .query({ summary: 'true' })
      .expect(200);

    expect(response.body.summaries).toEqual([
      {
        assetId,
        origin: 'imported',
        generation: null,
        markKinds: [],
        selections: [],
        approved: false,
        linkedEntities: { entities: [], total: 0 },
        thumbnailAssetId: null,
      },
    ]);
  });

  it('reports a generated asset with its generation id, capability, provider and model', async () => {
    const assetId = await uploadAsset('portrait.png');
    const generationId = await recordGeneration(assetId);

    const response = await http()
      .get(`/api/projects/${project.id}/assets`)
      .query({ summary: 'true' })
      .expect(200);

    expect(response.body.summaries).toEqual([
      {
        assetId,
        origin: 'generated',
        generation: {
          generationId,
          capability: 'image.generate',
          provider: 'anthropic',
          model: 'claude',
        },
        markKinds: [],
        selections: [],
        approved: false,
        linkedEntities: { entities: [], total: 0 },
        thumbnailAssetId: null,
      },
    ]);
  });

  it('narrows by origin, in both directions, and reflects it in total', async () => {
    const uploaded = await uploadAsset('uploaded.png');
    const generated = await uploadAsset('generated.png');
    await recordGeneration(generated);

    const generatedOnly = await http()
      .get(`/api/projects/${project.id}/assets`)
      .query({ origin: 'generated' })
      .expect(200);
    expect(generatedOnly.body.total).toBe(1);
    expect(generatedOnly.body.items.map((asset: { id: string }) => asset.id)).toEqual([generated]);

    const importedOnly = await http()
      .get(`/api/projects/${project.id}/assets`)
      .query({ origin: 'imported' })
      .expect(200);
    expect(importedOnly.body.total).toBe(1);
    expect(importedOnly.body.items.map((asset: { id: string }) => asset.id)).toEqual([uploaded]);
  });

  it('implies summary=true when only origin is given', async () => {
    await uploadAsset('kael.png');

    const response = await http()
      .get(`/api/projects/${project.id}/assets`)
      .query({ origin: 'imported' })
      .expect(200);

    expect(response.body.summaries).toHaveLength(1);
  });

  it('rejects an unknown origin', async () => {
    await http().get(`/api/projects/${project.id}/assets`).query({ origin: 'stolen' }).expect(400);
  });
});

describe('linked entities', () => {
  async function uploadAsset(filename: string): Promise<string> {
    const created = await http()
      .post(`/api/projects/${project.id}/assets`)
      .send({ kind: 'image', filename, mimeType: 'image/png', contentBase64: pngBase64 })
      .expect(201);
    return created.body.id as string;
  }

  async function createCharacter(name: string) {
    const entity = createEntity(
      { projectId: project.id, type: 'character', name },
      { clock, ids: sequentialIdGenerator('entity') },
    );
    return entities.insert(entity);
  }

  /** Points a fresh `asset_reference` entity at `assetId` and relates it to `entityId`. */
  async function linkAssetToEntity(assetId: string, entityId: string): Promise<void> {
    const reference = createEntity(
      {
        projectId: project.id,
        type: 'asset_reference',
        name: 'asset reference',
        data: assetReferenceData(assetId),
      },
      { clock, ids: sequentialIdGenerator('reference') },
    );
    const inserted = await entities.insert(reference);
    const relationship = createEntityRelationship(
      {
        projectId: project.id,
        sourceEntityId: entityId,
        targetEntityId: inserted.id,
        relation: 'references',
      },
      { clock, ids: sequentialIdGenerator('relationship') },
    );
    await relationships.insert(relationship);
  }

  it('reports the entities that reference an asset, with a total', async () => {
    const assetId = await uploadAsset('kira-portrait.png');
    const kira = await createCharacter('Kira');
    await linkAssetToEntity(assetId, kira.id);

    const response = await http()
      .get(`/api/projects/${project.id}/assets`)
      .query({ summary: 'true' })
      .expect(200);

    const summary = response.body.summaries.find(
      (entry: { assetId: string }) => entry.assetId === assetId,
    );
    expect(summary.linkedEntities).toEqual({
      entities: [{ entityId: kira.id, type: 'character', name: 'Kira' }],
      total: 1,
    });
  });

  it('narrows to assets reachable from the given entity and reflects it in total', async () => {
    const linkedAssetId = await uploadAsset('linked.png');
    const unlinkedAssetId = await uploadAsset('unlinked.png');
    const kira = await createCharacter('Kira');
    await linkAssetToEntity(linkedAssetId, kira.id);

    const response = await http()
      .get(`/api/projects/${project.id}/assets`)
      .query({ linkedEntityId: kira.id })
      .expect(200);

    expect(response.body.items.map((asset: { id: string }) => asset.id)).toEqual([linkedAssetId]);
    expect(response.body.total).toBe(1);
    expect(response.body.summaries).toHaveLength(1);
    expect(unlinkedAssetId).not.toBe(linkedAssetId);
  });
});
