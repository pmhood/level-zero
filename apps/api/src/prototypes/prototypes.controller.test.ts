import {
  AssetService,
  EntityService,
  EntityVersionService,
  PrototypeService,
  createProject,
  fixedClock,
  sequentialIdGenerator,
  type Entity,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryAssetRepository,
  InMemoryEntityRepository,
  InMemoryEntityVersionRepository,
  InMemoryObjectStorageProvider,
  InMemoryProjectRepository,
  InMemoryPrototypeVersionRepository,
} from '@level-zero/domain/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { PrototypesController } from './prototypes.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let app: INestApplication;
let entities: EntityService;
let versions: EntityVersionService;
let assets: AssetService;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projects = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const versionRepo = new InMemoryEntityVersionRepository();
  const assetRepo = new InMemoryAssetRepository();

  entities = new EntityService(entityRepo, projects, deps);
  versions = new EntityVersionService(versionRepo, entityRepo, deps);
  assets = new AssetService(assetRepo, projects, new InMemoryObjectStorageProvider(), deps);
  const prototypeService = new PrototypeService(
    new InMemoryPrototypeVersionRepository(),
    entities,
    versionRepo,
    assetRepo,
    deps,
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [PrototypesController],
    providers: [
      { provide: PrototypeService, useValue: prototypeService },
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

const prototypesUrl = () => `/api/projects/${project.id}/prototypes`;

/** An entity with one committed version, ready to be prototyped. */
async function committed(
  type: 'character' | 'mechanic' | 'scene',
  name: string,
  projectId = project.id,
): Promise<Entity> {
  const entity = await entities.create(projectId, { type, name });
  await versions.commit(projectId, entity.id);
  return entities.getById(projectId, entity.id);
}

describe('creating a prototype', () => {
  it('creates the prototype entity and pins the current entity versions', async () => {
    const diver = await committed('character', 'The Diver');
    const oxygen = await committed('mechanic', 'Oxygen drain');

    const response = await http()
      .post(prototypesUrl())
      .send({
        prototypeName: 'Vertical slice',
        notes: 'first playable',
        members: [{ entityId: diver.id }, { entityId: oxygen.id }],
      })
      .expect(201);

    expect(response.body.prototype).toMatchObject({ type: 'prototype', name: 'Vertical slice' });
    expect(response.body.version).toMatchObject({
      versionNumber: 1,
      status: 'draft',
      notes: 'first playable',
      members: [
        { entityId: diver.id, entityVersionId: diver.currentVersionId },
        { entityId: oxygen.id, entityVersionId: oxygen.currentVersionId },
      ],
    });
  });

  it('rejects a request with no members field at all', async () => {
    await http().post(prototypesUrl()).send({ prototypeName: 'Nothing' }).expect(400);
  });

  it('returns 404 for an entity from another project', async () => {
    const foreign = await committed('character', 'Someone else', otherProject.id);

    await http()
      .post(prototypesUrl())
      .send({ prototypeName: 'Cross-project', members: [{ entityId: foreign.id }] })
      .expect(404);
  });
});

describe('prototype versions', () => {
  it('captures a second version and compares it with the first', async () => {
    const diver = await committed('character', 'The Diver');
    const created = await http()
      .post(prototypesUrl())
      .send({ prototypeName: 'Vertical slice', members: [{ entityId: diver.id }] })
      .expect(201);
    const prototypeId = created.body.prototype.id;

    await entities.update(project.id, diver.id, { name: 'The Diver, rewritten' });
    await versions.commit(project.id, diver.id);
    const wreck = await committed('scene', 'The wreck');

    const second = await http()
      .post(`${prototypesUrl()}/${prototypeId}/versions`)
      .send({ name: 'Playtest build', members: [{ entityId: diver.id }, { entityId: wreck.id }] })
      .expect(201);

    expect(second.body).toMatchObject({ versionNumber: 2, name: 'Playtest build' });

    const comparison = await http()
      .get(`${prototypesUrl()}/${prototypeId}/versions/compare`)
      .query({ from: created.body.version.id, to: second.body.id })
      .expect(200);

    expect(comparison.body.changed).toHaveLength(1);
    expect(comparison.body.changed[0]).toMatchObject({ entityId: diver.id });
    expect(comparison.body.added).toEqual([
      { entityId: wreck.id, from: null, to: wreck.currentVersionId },
    ]);
    expect(comparison.body.removed).toEqual([]);
  });

  it('resolves the historical entity versions a version pinned', async () => {
    const diver = await committed('character', 'The Diver');
    const created = await http()
      .post(prototypesUrl())
      .send({ prototypeName: 'Vertical slice', members: [{ entityId: diver.id }] })
      .expect(201);

    await entities.update(project.id, diver.id, { name: 'The Diver, rewritten' });
    await versions.commit(project.id, diver.id);

    const contents = await http()
      .get(
        `${prototypesUrl()}/${created.body.prototype.id}/versions/${created.body.version.id}/contents`,
      )
      .expect(200);

    expect(contents.body.entityVersions).toHaveLength(1);
    expect(contents.body.entityVersions[0].snapshot).toMatchObject({ name: 'The Diver' });
    expect(contents.body.buildAsset).toBeNull();
  });

  it('lists versions newest first', async () => {
    const diver = await committed('character', 'The Diver');
    const created = await http()
      .post(prototypesUrl())
      .send({ prototypeName: 'Vertical slice', members: [{ entityId: diver.id }] })
      .expect(201);
    await http()
      .post(`${prototypesUrl()}/${created.body.prototype.id}/versions`)
      .send({ members: [{ entityId: diver.id }] })
      .expect(201);

    const response = await http()
      .get(`${prototypesUrl()}/${created.body.prototype.id}/versions`)
      .expect(200);

    expect(response.body.total).toBe(2);
    expect(
      response.body.items.map((item: { versionNumber: number }) => item.versionNumber),
    ).toEqual([2, 1]);
  });

  it('attaches a build artifact and marks the version playable', async () => {
    const diver = await committed('character', 'The Diver');
    const build = await assets.upload(project.id, {
      kind: 'build_artifact',
      filename: 'slice.zip',
      mimeType: 'application/zip',
      content: Buffer.from('build'),
    });
    const created = await http()
      .post(prototypesUrl())
      .send({ prototypeName: 'Vertical slice', members: [{ entityId: diver.id }] })
      .expect(201);

    const annotated = await http()
      .patch(`${prototypesUrl()}/${created.body.prototype.id}/versions/${created.body.version.id}`)
      .send({ status: 'playable', buildAssetId: build.id })
      .expect(200);

    expect(annotated.body).toMatchObject({ status: 'playable', buildAssetId: build.id });
    expect(annotated.body.members).toEqual(created.body.version.members);
  });

  it('returns 404 for a prototype version in another project', async () => {
    const diver = await committed('character', 'The Diver');
    const created = await http()
      .post(prototypesUrl())
      .send({ prototypeName: 'Vertical slice', members: [{ entityId: diver.id }] })
      .expect(201);

    await http()
      .get(
        `/api/projects/${otherProject.id}/prototypes/${created.body.prototype.id}/versions/${created.body.version.id}`,
      )
      .expect(404);
  });

  it('returns 409 when an entity has no version to pin', async () => {
    const draft = await entities.create(project.id, { type: 'character', name: 'Unversioned' });

    const response = await http()
      .post(prototypesUrl())
      .send({ prototypeName: 'Too early', members: [{ entityId: draft.id }] })
      .expect(409);

    expect(response.body).toMatchObject({ error: 'conflict' });
  });
});
