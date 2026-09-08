import {
  EntityService,
  EntityVersionService,
  createProject,
  fixedClock,
  sequentialIdGenerator,
  type Entity,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryEntityRepository,
  InMemoryEntityVersionRepository,
  InMemoryProjectRepository,
} from '@level-zero/domain/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { VersionsController } from './versions.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let app: INestApplication;
let entities: EntityService;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projectRepo = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const versionRepo = new InMemoryEntityVersionRepository();

  entities = new EntityService(entityRepo, projectRepo, deps);
  const versions = new EntityVersionService(versionRepo, entityRepo, deps);

  const moduleRef = await Test.createTestingModule({
    controllers: [VersionsController],
    providers: [
      { provide: EntityVersionService, useValue: versions },
      { provide: APP_FILTER, useClass: DomainExceptionFilter },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  project = await projectRepo.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project-a') }),
  );
  otherProject = await projectRepo.insert(
    createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
  );
});

afterEach(async () => {
  await app.close();
});

const http = () => request(app.getHttpServer());

function character(name = 'Kael'): Promise<Entity> {
  return entities.create(project.id, { type: 'character', name, data: { morale: 1 } });
}

function versionsUrl(entityId: string, projectId = project.id): string {
  return `/api/projects/${projectId}/entities/${entityId}/versions`;
}

describe('committing and reading versions', () => {
  it('commits the entity current content', async () => {
    const kael = await character();

    const response = await http()
      .post(versionsUrl(kael.id))
      .send({ reason: 'milestone', createdBy: 'user-7' })
      .expect(201);

    expect(response.body).toMatchObject({
      versionNumber: 1,
      branchName: 'main',
      reason: 'milestone',
      createdBy: 'user-7',
      snapshot: { name: 'Kael', data: { morale: 1 } },
    });
  });

  it('returns the history with branches and the current version', async () => {
    const kael = await character();
    const first = await http().post(versionsUrl(kael.id)).send({}).expect(201);
    await entities.update(project.id, kael.id, { name: 'Kael Vex' });
    await http().post(versionsUrl(kael.id)).send({}).expect(201);
    await http()
      .post(`${versionsUrl(kael.id)}/${first.body.id}/branch`)
      .send({ branchName: 'sketch' })
      .expect(201);

    const response = await http().get(versionsUrl(kael.id)).expect(200);

    expect(response.body.total).toBe(3);
    expect(response.body.branches).toEqual(['main', 'sketch']);
    expect(response.body.currentVersionId).toEqual(expect.any(String));
    expect(response.body.versions[0]).toHaveProperty('parentVersionId');
  });

  it('filters history by branch', async () => {
    const kael = await character();
    const first = await http().post(versionsUrl(kael.id)).send({}).expect(201);
    await http()
      .post(`${versionsUrl(kael.id)}/${first.body.id}/branch`)
      .send({ branchName: 'sketch' })
      .expect(201);

    const response = await http()
      .get(`${versionsUrl(kael.id)}?branch=sketch`)
      .expect(200);
    expect(response.body.total).toBe(1);
  });

  it('rejects an unknown reason', async () => {
    const kael = await character();

    await http().post(versionsUrl(kael.id)).send({ reason: 'vibes' }).expect(400);
  });

  it('returns 409 when the entity is archived', async () => {
    const kael = await character();
    await entities.archive(project.id, kael.id);

    await http().post(versionsUrl(kael.id)).send({}).expect(409);
  });

  it('returns 404 through another project', async () => {
    const kael = await character();

    await http().post(versionsUrl(kael.id, otherProject.id)).send({}).expect(404);
  });
});

describe('comparing versions', () => {
  it('routes /compare to the comparison, not to a version lookup', async () => {
    const kael = await character();
    const first = await http().post(versionsUrl(kael.id)).send({}).expect(201);
    await entities.update(project.id, kael.id, { name: 'Kael Vex', data: { morale: 4 } });
    const second = await http().post(versionsUrl(kael.id)).send({}).expect(201);

    const response = await http()
      .get(`${versionsUrl(kael.id)}/compare?from=${first.body.id}&to=${second.body.id}`)
      .expect(200);

    expect(response.body.changes).toEqual([
      { field: 'name', from: 'Kael', to: 'Kael Vex' },
      { field: 'data.morale', from: 1, to: 4 },
    ]);
  });

  it('requires both ends of the comparison', async () => {
    const kael = await character();
    const first = await http().post(versionsUrl(kael.id)).send({}).expect(201);

    await http()
      .get(`${versionsUrl(kael.id)}/compare?from=${first.body.id}`)
      .expect(400);
  });

  it('still resolves a single version by id', async () => {
    const kael = await character();
    const created = await http().post(versionsUrl(kael.id)).send({}).expect(201);

    const response = await http()
      .get(`${versionsUrl(kael.id)}/${created.body.id}`)
      .expect(200);
    expect(response.body.id).toBe(created.body.id);
  });
});

describe('restore, branch and promote', () => {
  it('restores an earlier version without losing later history', async () => {
    const kael = await character();
    const first = await http().post(versionsUrl(kael.id)).send({}).expect(201);
    await entities.update(project.id, kael.id, { name: 'Kael Vex' });
    await http().post(versionsUrl(kael.id)).send({}).expect(201);

    const restored = await http()
      .post(`${versionsUrl(kael.id)}/${first.body.id}/restore`)
      .send({})
      .expect(201);

    expect(restored.body).toMatchObject({
      reason: 'restore',
      metadata: { restoredFromVersionId: first.body.id },
      snapshot: { name: 'Kael' },
    });
    await expect(entities.getById(project.id, kael.id)).resolves.toMatchObject({ name: 'Kael' });

    const history = await http().get(versionsUrl(kael.id)).expect(200);
    expect(history.body.total).toBe(3);
  });

  it('branches from an earlier version', async () => {
    const kael = await character();
    const first = await http().post(versionsUrl(kael.id)).send({}).expect(201);

    const branched = await http()
      .post(`${versionsUrl(kael.id)}/${first.body.id}/branch`)
      .send({ branchName: 'sketch' })
      .expect(201);

    expect(branched.body).toMatchObject({
      branchName: 'sketch',
      parentVersionId: first.body.id,
      reason: 'branch',
    });
  });

  it('rejects a duplicate branch name with 409', async () => {
    const kael = await character();
    const first = await http().post(versionsUrl(kael.id)).send({}).expect(201);
    await http()
      .post(`${versionsUrl(kael.id)}/${first.body.id}/branch`)
      .send({ branchName: 'sketch' })
      .expect(201);

    await http()
      .post(`${versionsUrl(kael.id)}/${first.body.id}/branch`)
      .send({ branchName: 'sketch' })
      .expect(409);
  });

  it('requires a branch name', async () => {
    const kael = await character();
    const first = await http().post(versionsUrl(kael.id)).send({}).expect(201);

    await http()
      .post(`${versionsUrl(kael.id)}/${first.body.id}/branch`)
      .send({})
      .expect(400);
  });

  it('promotes branch work onto main', async () => {
    const kael = await character();
    const first = await http().post(versionsUrl(kael.id)).send({}).expect(201);
    await http()
      .post(`${versionsUrl(kael.id)}/${first.body.id}/branch`)
      .send({ branchName: 'sketch' })
      .expect(201);
    await entities.update(project.id, kael.id, { name: 'Kael the Drifter' });
    const sketchTip = await http().post(versionsUrl(kael.id)).send({}).expect(201);

    const promoted = await http()
      .post(`${versionsUrl(kael.id)}/${sketchTip.body.id}/promote`)
      .send({})
      .expect(201);

    expect(promoted.body).toMatchObject({ branchName: 'main', reason: 'promotion' });
    await expect(entities.getById(project.id, kael.id)).resolves.toMatchObject({
      name: 'Kael the Drifter',
    });
  });

  it('returns 404 restoring a version through another project', async () => {
    const kael = await character();
    const first = await http().post(versionsUrl(kael.id)).send({}).expect(201);

    await http()
      .post(`${versionsUrl(kael.id, otherProject.id)}/${first.body.id}/restore`)
      .send({})
      .expect(404);
  });
});
