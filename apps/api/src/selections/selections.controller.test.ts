import {
  AssetSelectionService,
  ReviewTargetResolver,
  createAsset,
  createEntity,
  fixedClock,
  sequentialIdGenerator,
  type Asset,
  type Entity,
} from '@level-zero/domain';
import {
  InMemoryAssetMarkRepository,
  InMemoryAssetRepository,
  InMemoryAssetSelectionRepository,
  InMemoryEntityRepository,
  InMemoryEntityVersionRepository,
  InMemoryPrototypeVersionRepository,
} from '@level-zero/domain/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { AssetMarksController } from './asset-marks.controller';
import { AssetSelectionsController } from './asset-selections.controller';

const deps = { clock: fixedClock('2026-03-01T09:00:00.000Z'), ids: sequentialIdGenerator('id') };

const project = 'project-1';
const otherProject = 'project-2';

let app: INestApplication;
let entityRepo: InMemoryEntityRepository;
let assetRepo: InMemoryAssetRepository;
let diver: Entity;
let concepts: Asset[];

const url = (path = '') => `/api/projects/${project}/asset-selections${path}`;
const marksUrl = (path = '') => `/api/projects/${project}/asset-marks${path}`;

async function image(projectId: string, filename: string): Promise<Asset> {
  return assetRepo.insert(
    createAsset(
      {
        projectId,
        kind: 'image',
        filename,
        mimeType: 'image/png',
        byteSize: 2048,
        storageKey: `assets/${filename}`,
        checksum: filename,
      },
      deps,
    ),
  );
}

beforeEach(async () => {
  entityRepo = new InMemoryEntityRepository();
  assetRepo = new InMemoryAssetRepository();

  const service = new AssetSelectionService(
    new InMemoryAssetSelectionRepository(),
    new InMemoryAssetMarkRepository(),
    new ReviewTargetResolver(
      entityRepo,
      assetRepo,
      new InMemoryPrototypeVersionRepository(),
      new InMemoryEntityVersionRepository(),
    ),
    deps,
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [AssetMarksController, AssetSelectionsController],
    providers: [
      { provide: AssetSelectionService, useValue: service },
      { provide: APP_FILTER, useClass: DomainExceptionFilter },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  diver = await entityRepo.insert(
    createEntity({ projectId: project, type: 'character', name: 'The Diver' }, deps),
  );
  concepts = [await image(project, 'diver-a.png'), await image(project, 'diver-b.png')];
});

afterEach(async () => {
  await app.close();
});

describe('asset selections', () => {
  it('reads an empty selection for a context nobody has decided on', async () => {
    const response = await request(app.getHttpServer())
      .get(url())
      .query({ entityId: diver.id, purpose: 'portrait' })
      .expect(200);

    expect(response.body).toEqual({
      context: { entityId: diver.id, purpose: 'portrait' },
      current: [],
      history: [],
    });
  });

  it('rejects a read that does not say what it is asking about', async () => {
    await request(app.getHttpServer()).get(url()).query({ entityId: diver.id }).expect(400);
  });

  it('records an approval with its actor, note and purpose', async () => {
    const response = await request(app.getHttpServer())
      .post(url('/approve'))
      .send({
        assetId: concepts[0]!.id,
        entityId: diver.id,
        purpose: 'portrait',
        actor: 'Ada',
        note: 'Reads at thumbnail size.',
      })
      .expect(201);

    expect(response.body.approval).toMatchObject({
      assetId: concepts[0]!.id,
      context: { entityId: diver.id, purpose: 'portrait' },
      state: 'approved',
      actor: 'Ada',
      note: 'Reads at thumbnail size.',
    });
    expect(response.body.superseded).toEqual([]);
  });

  it('supersedes the approval it replaces, naming the replacement', async () => {
    const first = await request(app.getHttpServer())
      .post(url('/approve'))
      .send({ assetId: concepts[0]!.id, entityId: diver.id, purpose: 'portrait', actor: 'Ada' })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(url('/approve'))
      .send({
        assetId: concepts[1]!.id,
        entityId: diver.id,
        purpose: 'portrait',
        actor: 'Ada',
        supersedes: [concepts[0]!.id],
      })
      .expect(201);

    expect(second.body.superseded).toHaveLength(1);
    expect(second.body.superseded[0]).toMatchObject({
      assetId: concepts[0]!.id,
      state: 'superseded',
      supersededBySelectionId: second.body.approval.id,
    });
    expect(first.body.approval.id).not.toBe(second.body.approval.id);

    const summary = await request(app.getHttpServer())
      .get(url())
      .query({ entityId: diver.id, purpose: 'portrait' })
      .expect(200);
    expect(summary.body.current.map((selection: { assetId: string }) => selection.assetId)).toEqual(
      [concepts[1]!.id],
    );
  });

  it('answers 409 when the asset being superseded was never approved', async () => {
    await request(app.getHttpServer())
      .post(url('/approve'))
      .send({
        assetId: concepts[1]!.id,
        entityId: diver.id,
        purpose: 'portrait',
        actor: 'Ada',
        supersedes: [concepts[0]!.id],
      })
      .expect(409);
  });

  it('answers 404 for a context entity in another project', async () => {
    const elsewhere = await entityRepo.insert(
      createEntity({ projectId: otherProject, type: 'character', name: 'Other' }, deps),
    );

    await request(app.getHttpServer())
      .post(url('/approve'))
      .send({
        assetId: concepts[0]!.id,
        entityId: elsewhere.id,
        purpose: 'portrait',
        actor: 'Ada',
      })
      .expect(404);
  });

  it('records a rejection and keeps it readable against the asset', async () => {
    await request(app.getHttpServer())
      .post(url('/reject'))
      .send({
        assetId: concepts[0]!.id,
        entityId: diver.id,
        purpose: 'portrait',
        actor: 'Ada',
        note: 'Too clean.',
      })
      .expect(201);

    const forAsset = await request(app.getHttpServer())
      .get(url(`/asset/${concepts[0]!.id}`))
      .expect(200);

    expect(forAsset.body).toHaveLength(1);
    expect(forAsset.body[0]).toMatchObject({ state: 'rejected', note: 'Too clean.' });
  });

  it('lists every purpose an entity currently stands behind', async () => {
    await request(app.getHttpServer())
      .post(url('/approve'))
      .send({ assetId: concepts[0]!.id, entityId: diver.id, purpose: 'portrait', actor: 'Ada' })
      .expect(201);
    await request(app.getHttpServer())
      .post(url('/approve'))
      .send({ assetId: concepts[1]!.id, entityId: diver.id, purpose: 'costume', actor: 'Ada' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(url(`/entity/${diver.id}`))
      .expect(200);

    expect(
      response.body.map((selection: { context: { purpose: string } }) => selection.context.purpose),
    ).toEqual(expect.arrayContaining(['portrait', 'costume']));
  });

  it('rejects an approval that names no actor', async () => {
    await request(app.getHttpServer())
      .post(url('/approve'))
      .send({ assetId: concepts[0]!.id, entityId: diver.id, purpose: 'portrait' })
      .expect(400);
  });
});

describe('asset marks', () => {
  it('marks, lists and unmarks', async () => {
    await request(app.getHttpServer())
      .post(marksUrl())
      .send({ assetId: concepts[0]!.id, kind: 'favorite', actor: 'Ada' })
      .expect(201);

    const listed = await request(app.getHttpServer()).get(marksUrl()).expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toMatchObject({ assetId: concepts[0]!.id, kind: 'favorite' });

    await request(app.getHttpServer())
      .delete(marksUrl(`/${concepts[0]!.id}/favorite`))
      .expect(204);
    await expect(
      request(app.getHttpServer())
        .get(marksUrl())
        .expect(200)
        .then((response) => response.body),
    ).resolves.toEqual([]);
  });

  it('narrows a listing to one kind', async () => {
    await request(app.getHttpServer())
      .post(marksUrl())
      .send({ assetId: concepts[0]!.id, kind: 'favorite', actor: 'Ada' })
      .expect(201);
    await request(app.getHttpServer())
      .post(marksUrl())
      .send({ assetId: concepts[1]!.id, kind: 'shortlisted', actor: 'Ada' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(marksUrl())
      .query({ kind: 'shortlisted' })
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].assetId).toBe(concepts[1]!.id);
  });

  it('rejects a mark outside the vocabulary', async () => {
    await request(app.getHttpServer())
      .post(marksUrl())
      .send({ assetId: concepts[0]!.id, kind: 'starred', actor: 'Ada' })
      .expect(400);

    await request(app.getHttpServer())
      .delete(marksUrl(`/${concepts[0]!.id}/starred`))
      .expect(400);
  });

  it('answers 404 for an asset in another project', async () => {
    const elsewhere = await image(otherProject, 'other.png');

    await request(app.getHttpServer())
      .post(marksUrl())
      .send({ assetId: elsewhere.id, kind: 'favorite', actor: 'Ada' })
      .expect(404);
  });
});
