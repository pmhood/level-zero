import {
  ActivityService,
  AssetCollectionService,
  AssetLibraryService,
  AssetService,
  EntityRelationshipService,
  EntityService,
  createProject,
  fixedClock,
  sequentialIdGenerator,
  type Asset,
  type Entity,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryActivityRepository,
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
import { AssetCollectionsController } from './asset-collections.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let app: INestApplication;
let entities: EntityService;
let assets: AssetService;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projects = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const assetRepo = new InMemoryAssetRepository();
  const relationshipRepo = new InMemoryEntityRelationshipRepository();

  const activity = new ActivityService(new InMemoryActivityRepository(), deps);
  entities = new EntityService(entityRepo, projects, activity, deps);
  assets = new AssetService(
    assetRepo,
    projects,
    new InMemoryObjectStorageProvider(),
    activity,
    deps,
  );
  const relationships = new EntityRelationshipService(relationshipRepo, entityRepo, deps);
  const collections = new AssetCollectionService(entities, relationships, assetRepo);
  const library = new AssetLibraryService(
    new InMemoryAssetLibraryReadModel(
      assetRepo,
      new InMemoryGenerationRepository(),
      new InMemoryAssetMarkRepository(),
      new InMemoryAssetSelectionRepository(),
      entityRepo,
      relationshipRepo,
    ),
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [AssetCollectionsController],
    providers: [
      { provide: AssetCollectionService, useValue: collections },
      { provide: AssetLibraryService, useValue: library },
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

function http() {
  return request(app.getHttpServer());
}

function collectionsPath(projectId: string, suffix = ''): string {
  return `/api/projects/${projectId}/asset-collections${suffix}`;
}

function image(name = 'reef.png', projectId = project.id): Promise<Asset> {
  return assets.upload(projectId, {
    kind: 'image',
    filename: name,
    mimeType: 'image/png',
    content: Buffer.from(name),
  });
}

function collection(name = 'Props & Gear', projectId = project.id): Promise<Entity> {
  return entities.create(projectId, { type: 'asset_collection', name });
}

describe('creating a collection', () => {
  it('creates an asset_collection entity', async () => {
    const response = await http()
      .post(collectionsPath(project.id))
      .send({ name: 'Props & Gear', description: 'Set dressing', tags: ['props'] })
      .expect(201);

    expect(response.body).toMatchObject({
      type: 'asset_collection',
      name: 'Props & Gear',
      description: 'Set dressing',
      tags: ['props'],
    });
  });
});

describe('renaming a collection', () => {
  it('renames it', async () => {
    const board = await collection();

    const response = await http()
      .patch(collectionsPath(project.id, `/${board.id}`))
      .send({ name: 'Environment Props' })
      .expect(200);

    expect(response.body.name).toBe('Environment Props');
  });

  it('returns 404 through another project', async () => {
    const board = await collection();

    await http()
      .patch(collectionsPath(otherProject.id, `/${board.id}`))
      .send({ name: 'x' })
      .expect(404);
  });
});

describe('archiving a collection', () => {
  it('archives the collection and leaves member assets untouched', async () => {
    const board = await collection();
    const asset = await image();
    await http()
      .post(collectionsPath(project.id, `/${board.id}/assets`))
      .send({
        assetId: asset.id,
      });

    const response = await http()
      .post(collectionsPath(project.id, `/${board.id}/archive`))
      .expect(201);

    expect(response.body.status).toBe('archived');
    const untouched = await assets.getById(project.id, asset.id);
    expect(untouched.status).toBe('active');
  });
});

describe('membership', () => {
  it('adds an asset to a collection', async () => {
    const board = await collection();
    const asset = await image();

    const response = await http()
      .post(collectionsPath(project.id, `/${board.id}/assets`))
      .send({ assetId: asset.id })
      .expect(201);

    expect(response.body).toMatchObject({ sourceEntityId: board.id, relation: 'contains' });
  });

  it('removes an asset from a collection without touching the asset', async () => {
    const board = await collection();
    const asset = await image();
    await http()
      .post(collectionsPath(project.id, `/${board.id}/assets`))
      .send({ assetId: asset.id })
      .expect(201);

    await http()
      .delete(collectionsPath(project.id, `/${board.id}/assets/${asset.id}`))
      .expect(204);

    const untouched = await assets.getById(project.id, asset.id);
    expect(untouched.status).toBe('active');
  });
});

describe('collection counts', () => {
  it('reports active member counts per collection', async () => {
    const board = await collection();
    const asset = await image();
    await http()
      .post(collectionsPath(project.id, `/${board.id}/assets`))
      .send({ assetId: asset.id })
      .expect(201);

    const response = await http().get(collectionsPath(project.id, '/counts')).expect(200);

    expect(response.body).toEqual({ [board.id]: 1 });
  });

  it('omits a collection with no members', async () => {
    await collection();

    const response = await http().get(collectionsPath(project.id, '/counts')).expect(200);

    expect(response.body).toEqual({});
  });
});
