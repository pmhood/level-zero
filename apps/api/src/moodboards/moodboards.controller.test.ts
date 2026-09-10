import {
  ActivityService,
  AssetService,
  EntityRelationshipService,
  EntityService,
  MoodboardService,
  createProject,
  fixedClock,
  sequentialIdGenerator,
  type Asset,
  type Entity,
  type MoodboardNode,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryActivityRepository,
  InMemoryAssetRepository,
  InMemoryEntityRelationshipRepository,
  InMemoryEntityRepository,
  InMemoryMoodboardRepository,
  InMemoryObjectStorageProvider,
  InMemoryProjectRepository,
} from '@level-zero/domain/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { MoodboardsController } from './moodboards.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let app: INestApplication;
let entities: EntityService;
let assets: AssetService;
let project: Project;
let board: Entity;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projects = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const assetRepo = new InMemoryAssetRepository();
  const relationshipRepo = new InMemoryEntityRelationshipRepository();

  const activity = new ActivityService(new InMemoryActivityRepository(), deps);
  entities = new EntityService(entityRepo, projects, activity, deps);
  assets = new AssetService(assetRepo, projects, new InMemoryObjectStorageProvider(), deps);
  const moodboards = new MoodboardService(
    new InMemoryMoodboardRepository(relationshipRepo),
    entities,
    assetRepo,
    new EntityRelationshipService(relationshipRepo, entityRepo, deps),
    deps,
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [MoodboardsController],
    providers: [
      { provide: MoodboardService, useValue: moodboards },
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
  board = await entities.create(project.id, { type: 'moodboard', name: 'Wreck interiors' });
});

afterEach(async () => {
  await app.close();
});

function boardPath(suffix = ''): string {
  return `/api/projects/${project.id}/moodboards/${board.id}${suffix}`;
}

function image(name = 'reef.png'): Promise<Asset> {
  return assets.upload(project.id, {
    kind: 'image',
    filename: name,
    mimeType: 'image/png',
    content: Buffer.from(name),
  });
}

async function place(body: Record<string, unknown>): Promise<MoodboardNode> {
  const response = await request(app.getHttpServer())
    .post(boardPath('/nodes'))
    .send(body)
    .expect(201);
  return response.body as MoodboardNode;
}

describe('GET /projects/:projectId/moodboards/:boardId', () => {
  it('returns an empty board', async () => {
    const response = await request(app.getHttpServer()).get(boardPath()).expect(200);

    expect(response.body).toMatchObject({ nodes: [], connectors: [] });
    expect(response.body.board.id).toBe(board.id);
  });

  it('404s for a board that is not there', async () => {
    await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/moodboards/missing`)
      .expect(404);
  });

  it('400s for an entity that is not a moodboard', async () => {
    const character = await entities.create(project.id, { type: 'character', name: 'Tam' });

    await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/moodboards/${character.id}`)
      .expect(400);
  });
});

describe('placing and moving nodes', () => {
  it('places an asset and reads its layout back', async () => {
    const asset = await image();

    const node = await place({ type: 'asset', assetId: asset.id, x: 40, y: 60, width: 300 });

    expect(node).toMatchObject({ assetId: asset.id, x: 40, y: 60, width: 300 });
    const response = await request(app.getHttpServer()).get(boardPath()).expect(200);
    expect(response.body.nodes).toHaveLength(1);
  });

  it('rejects an asset node with no asset', async () => {
    await request(app.getHttpServer())
      .post(boardPath('/nodes'))
      .send({ type: 'asset' })
      .expect(400);
  });

  it('rejects an unknown node type before the service sees it', async () => {
    await request(app.getHttpServer())
      .post(boardPath('/nodes'))
      .send({ type: 'sculpture' })
      .expect(400);
  });

  it('moves a selection in one request', async () => {
    const first = await place({ type: 'note' });
    const second = await place({ type: 'text' });

    const response = await request(app.getHttpServer())
      .patch(boardPath('/nodes'))
      .send({
        nodes: [
          { id: first.id, x: 100, y: 100 },
          { id: second.id, x: 200, rotation: 0.5 },
        ],
      })
      .expect(200);

    expect(response.body).toMatchObject([
      { id: first.id, x: 100, y: 100 },
      { id: second.id, x: 200, rotation: 0.5 },
    ]);
  });

  it('409s on a locked node', async () => {
    const node = await place({ type: 'note', locked: true });

    await request(app.getHttpServer())
      .patch(boardPath('/nodes'))
      .send({ nodes: [{ id: node.id, x: 10 }] })
      .expect(409);
  });
});

describe('removing and duplicating', () => {
  it('removes the placement without archiving the asset', async () => {
    const asset = await image();
    const node = await place({ type: 'asset', assetId: asset.id });

    await request(app.getHttpServer())
      .delete(boardPath(`/nodes/${node.id}`))
      .expect(204);

    expect((await assets.getById(project.id, asset.id)).status).toBe('active');
    const response = await request(app.getHttpServer()).get(boardPath()).expect(200);
    expect(response.body.nodes).toEqual([]);
  });

  it('removes multiple placements in one request', async () => {
    const asset1 = await image('img1.png');
    const asset2 = await image('img2.png');
    const node1 = await place({ type: 'asset', assetId: asset1.id });
    const node2 = await place({ type: 'asset', assetId: asset2.id });

    await request(app.getHttpServer())
      .post(boardPath('/nodes/remove'))
      .send({ nodeIds: [node1.id, node2.id] })
      .expect(204);

    const response = await request(app.getHttpServer()).get(boardPath()).expect(200);
    expect(response.body.nodes).toEqual([]);
    expect((await assets.getById(project.id, asset1.id)).status).toBe('active');
    expect((await assets.getById(project.id, asset2.id)).status).toBe('active');
  });

  it('rejects batch removal with invalid node', async () => {
    const asset = await image();
    const node = await place({ type: 'asset', assetId: asset.id });

    await request(app.getHttpServer())
      .post(boardPath('/nodes/remove'))
      .send({ nodeIds: [node.id, 'invalid-id'] })
      .expect(404);

    const response = await request(app.getHttpServer()).get(boardPath()).expect(200);
    expect(response.body.nodes).toHaveLength(1);
  });

  it('duplicates a placement without duplicating the asset', async () => {
    const asset = await image();
    const node = await place({ type: 'asset', assetId: asset.id, x: 10, y: 10 });

    const response = await request(app.getHttpServer())
      .post(boardPath('/nodes/duplicate'))
      .send({ nodeIds: [node.id], offset: 50 })
      .expect(201);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ assetId: asset.id, x: 60, y: 60 });
    expect(response.body[0].id).not.toBe(node.id);
    expect((await assets.listByProject(project.id, {})).total).toBe(1);
  });
});

describe('connectors', () => {
  async function twoEntityNodes(): Promise<{ tam: Entity; from: string; to: string }> {
    const tam = await entities.create(project.id, { type: 'character', name: 'Tam' });
    const reef = await entities.create(project.id, { type: 'location', name: 'The Reef' });
    const from = await place({ type: 'entity', entityId: tam.id });
    const to = await place({ type: 'entity', entityId: reef.id });
    return { tam, from: from.id, to: to.id };
  }

  it('draws a line that is not yet a relationship', async () => {
    const { from, to } = await twoEntityNodes();

    const response = await request(app.getHttpServer())
      .post(boardPath('/connectors'))
      .send({ fromNodeId: from, toNodeId: to, label: 'grew up here' })
      .expect(201);

    expect(response.body).toMatchObject({ label: 'grew up here', relationshipId: null });
  });

  it('promotes a line into a relationship only when asked', async () => {
    const { from, to } = await twoEntityNodes();
    const connector = (
      await request(app.getHttpServer())
        .post(boardPath('/connectors'))
        .send({ fromNodeId: from, toNodeId: to })
        .expect(201)
    ).body;

    const response = await request(app.getHttpServer())
      .post(boardPath(`/connectors/${connector.id}/promote`))
      .send({ relation: 'appears_in' })
      .expect(201);

    expect(response.body.relationship).toMatchObject({ relation: 'appears_in' });
    expect(response.body.connector.relationshipId).toBe(response.body.relationship.id);
  });

  it('rejects a relation the project graph does not have', async () => {
    const { from, to } = await twoEntityNodes();
    const connector = (
      await request(app.getHttpServer())
        .post(boardPath('/connectors'))
        .send({ fromNodeId: from, toNodeId: to })
        .expect(201)
    ).body;

    await request(app.getHttpServer())
      .post(boardPath(`/connectors/${connector.id}/promote`))
      .send({ relation: 'vibes_with' })
      .expect(400);
  });

  it('erases a line', async () => {
    const { from, to } = await twoEntityNodes();
    const connector = (
      await request(app.getHttpServer())
        .post(boardPath('/connectors'))
        .send({ fromNodeId: from, toNodeId: to })
        .expect(201)
    ).body;

    await request(app.getHttpServer())
      .delete(boardPath(`/connectors/${connector.id}`))
      .expect(204);

    const response = await request(app.getHttpServer()).get(boardPath()).expect(200);
    expect(response.body.connectors).toEqual([]);
  });
});
