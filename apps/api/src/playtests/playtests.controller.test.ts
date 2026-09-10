import {
  ActivityService,
  AssetService,
  EntityService,
  EntityVersionService,
  PlaytestService,
  PrototypeService,
  createProject,
  fixedClock,
  sequentialIdGenerator,
  type Entity,
  type Project,
  type PrototypeVersion,
} from '@level-zero/domain';
import {
  InMemoryActivityRepository,
  InMemoryAssetRepository,
  InMemoryEntityRepository,
  InMemoryEntityVersionRepository,
  InMemoryObjectStorageProvider,
  InMemoryPlaytestRepository,
  InMemoryProjectRepository,
  InMemoryPrototypeVersionRepository,
} from '@level-zero/domain/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { PlaytestsController } from './playtests.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let app: INestApplication;
let entities: EntityService;
let versions: EntityVersionService;
let prototypes: PrototypeService;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projects = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const versionRepo = new InMemoryEntityVersionRepository();
  const assetRepo = new InMemoryAssetRepository();
  const prototypeVersionRepo = new InMemoryPrototypeVersionRepository();
  const playtestRepo = new InMemoryPlaytestRepository();

  const activity = new ActivityService(new InMemoryActivityRepository(), deps);
  entities = new EntityService(entityRepo, projects, activity, deps);
  versions = new EntityVersionService(versionRepo, entityRepo, activity, deps);
  new AssetService(assetRepo, projects, new InMemoryObjectStorageProvider(), deps);
  prototypes = new PrototypeService(
    prototypeVersionRepo,
    entities,
    versionRepo,
    assetRepo,
    activity,
    deps,
  );
  const playtestService = new PlaytestService(playtestRepo, prototypeVersionRepo, entities, deps);

  const moduleRef = await Test.createTestingModule({
    controllers: [PlaytestsController],
    providers: [
      { provide: PlaytestService, useValue: playtestService },
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

const playtestsUrl = (projectId = project.id) => `/api/projects/${projectId}/playtests`;

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

/** A prototype with one captured version, ready to be playtested. */
async function prototyped(projectId = project.id): Promise<PrototypeVersion> {
  const diver = await committed('character', 'The Diver', projectId);
  const created = await prototypes.create(projectId, {
    prototypeName: 'Vertical slice',
    members: [{ entityId: diver.id }],
  });
  return created.version;
}

describe('creating a playtest', () => {
  it('creates a playtest pinned to the given prototype version', async () => {
    const version = await prototyped();

    const response = await http()
      .post(playtestsUrl())
      .send({
        prototypeVersionId: version.id,
        name: 'First usability pass',
        goal: 'Can a new player find the wreck?',
        tags: ['usability'],
      })
      .expect(201);

    expect(response.body).toMatchObject({
      prototypeVersionId: version.id,
      name: 'First usability pass',
      goal: 'Can a new player find the wreck?',
      status: 'planned',
      tags: ['usability'],
    });
  });

  it('rejects a request with no name', async () => {
    const version = await prototyped();

    await http().post(playtestsUrl()).send({ prototypeVersionId: version.id }).expect(400);
  });

  it('returns 404 for a prototype version from another project', async () => {
    const foreign = await prototyped(otherProject.id);

    await http()
      .post(playtestsUrl())
      .send({ prototypeVersionId: foreign.id, name: 'Cross-project' })
      .expect(404);
  });

  it('returns 404 for a prototype version that does not exist', async () => {
    await http()
      .post(playtestsUrl())
      .send({ prototypeVersionId: 'no-such-version', name: 'Nothing to test' })
      .expect(404);
  });
});

describe('reading and updating a playtest', () => {
  it('reads a playtest back by id', async () => {
    const version = await prototyped();
    const created = await http()
      .post(playtestsUrl())
      .send({ prototypeVersionId: version.id, name: 'First usability pass' })
      .expect(201);

    const response = await http().get(`${playtestsUrl()}/${created.body.id}`).expect(200);

    expect(response.body).toMatchObject({ id: created.body.id, name: 'First usability pass' });
  });

  it('returns 404 for a playtest from another project', async () => {
    const version = await prototyped();
    const created = await http()
      .post(playtestsUrl())
      .send({ prototypeVersionId: version.id, name: 'First usability pass' })
      .expect(201);

    await http()
      .get(`${playtestsUrl(otherProject.id)}/${created.body.id}`)
      .expect(404);
  });

  it('updates status and summary without touching the pinned version', async () => {
    const version = await prototyped();
    const created = await http()
      .post(playtestsUrl())
      .send({ prototypeVersionId: version.id, name: 'First usability pass' })
      .expect(201);

    const response = await http()
      .patch(`${playtestsUrl()}/${created.body.id}`)
      .send({ status: 'complete', summary: 'Everyone found the wreck.' })
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'complete',
      summary: 'Everyone found the wreck.',
      prototypeVersionId: version.id,
    });
  });

  it('still resolves its tested version after a newer version is captured', async () => {
    const version = await prototyped();
    const created = await http()
      .post(playtestsUrl())
      .send({ prototypeVersionId: version.id, name: 'First usability pass' })
      .expect(201);

    const diver = await entities.getById(project.id, (await committed('scene', 'The wreck')).id);
    await prototypes.capture(project.id, version.prototypeId, {
      members: [{ entityId: diver.id }],
    });

    const response = await http().get(`${playtestsUrl()}/${created.body.id}`).expect(200);

    expect(response.body.prototypeVersionId).toBe(version.id);
  });
});

describe('listing playtests', () => {
  it('lists playtests scoped to the project', async () => {
    const version = await prototyped();
    await http()
      .post(playtestsUrl())
      .send({ prototypeVersionId: version.id, name: 'Pass one' })
      .expect(201);
    await http()
      .post(playtestsUrl())
      .send({ prototypeVersionId: version.id, name: 'Pass two' })
      .expect(201);

    const foreignVersion = await prototyped(otherProject.id);
    await http()
      .post(playtestsUrl(otherProject.id))
      .send({ prototypeVersionId: foreignVersion.id, name: 'Someone else' })
      .expect(201);

    const response = await http().get(playtestsUrl()).expect(200);

    expect(response.body.total).toBe(2);
    expect(response.body.items.map((item: { name: string }) => item.name).sort()).toEqual([
      'Pass one',
      'Pass two',
    ]);
  });

  it('narrows to one prototype version', async () => {
    const versionOne = await prototyped();
    const created = await http()
      .post(playtestsUrl())
      .send({ prototypeVersionId: versionOne.id, name: 'Pass one' })
      .expect(201);

    const secondPrototype = await prototypes.create(project.id, {
      prototypeName: 'Second prototype',
      members: [{ entityId: (await committed('mechanic', 'Oxygen drain')).id }],
    });
    await http()
      .post(playtestsUrl())
      .send({ prototypeVersionId: secondPrototype.version.id, name: 'Unrelated pass' })
      .expect(201);

    const response = await http()
      .get(playtestsUrl())
      .query({ prototypeVersionId: versionOne.id })
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0].id).toBe(created.body.id);
  });
});

describe('sessions', () => {
  it('records multiple sessions, numbered in order', async () => {
    const version = await prototyped();
    const created = await http()
      .post(playtestsUrl())
      .send({ prototypeVersionId: version.id, name: 'First usability pass' })
      .expect(201);

    const first = await http()
      .post(`${playtestsUrl()}/${created.body.id}/sessions`)
      .send({ participant: 'Alex' })
      .expect(201);
    const second = await http()
      .post(`${playtestsUrl()}/${created.body.id}/sessions`)
      .send({ participant: 'Sam' })
      .expect(201);

    expect(first.body.sessionNumber).toBe(1);
    expect(second.body.sessionNumber).toBe(2);

    const listed = await http().get(`${playtestsUrl()}/${created.body.id}/sessions`).expect(200);
    expect(listed.body.map((session: { sessionNumber: number }) => session.sessionNumber)).toEqual([
      1, 2,
    ]);
  });

  it('returns 404 recording a session under a playtest from another project', async () => {
    const version = await prototyped();
    const created = await http()
      .post(playtestsUrl())
      .send({ prototypeVersionId: version.id, name: 'First usability pass' })
      .expect(201);

    await http()
      .post(`${playtestsUrl(otherProject.id)}/${created.body.id}/sessions`)
      .send({ participant: 'Alex' })
      .expect(404);
  });
});

describe('observations, feedback and metrics', () => {
  it('attaches observations, feedback and metrics to the playtest and to a session', async () => {
    const version = await prototyped();
    const created = await http()
      .post(playtestsUrl())
      .send({ prototypeVersionId: version.id, name: 'First usability pass' })
      .expect(201);
    const session = await http()
      .post(`${playtestsUrl()}/${created.body.id}/sessions`)
      .send({ participant: 'Alex' })
      .expect(201);

    const observation = await http()
      .post(`${playtestsUrl()}/${created.body.id}/observations`)
      .send({ sessionId: session.body.id, body: 'Got stuck at the trench', atSeconds: 42 })
      .expect(201);
    expect(observation.body).toMatchObject({ sessionId: session.body.id, atSeconds: 42 });

    const wholePlaytestObservation = await http()
      .post(`${playtestsUrl()}/${created.body.id}/observations`)
      .send({ body: 'Overall pacing felt slow' })
      .expect(201);
    expect(wholePlaytestObservation.body.sessionId).toBeNull();

    const feedback = await http()
      .post(`${playtestsUrl()}/${created.body.id}/feedback`)
      .send({ sessionId: session.body.id, body: 'Loved the visuals', sentiment: 'positive' })
      .expect(201);
    expect(feedback.body).toMatchObject({ sentiment: 'positive' });

    const metric = await http()
      .post(`${playtestsUrl()}/${created.body.id}/metrics`)
      .send({ sessionId: session.body.id, label: 'Session duration', value: 320, unit: 's' })
      .expect(201);
    expect(metric.body).toMatchObject({ label: 'Session duration', value: 320, unit: 's' });

    const observations = await http()
      .get(`${playtestsUrl()}/${created.body.id}/observations`)
      .expect(200);
    expect(observations.body).toHaveLength(2);

    const feedbackList = await http()
      .get(`${playtestsUrl()}/${created.body.id}/feedback`)
      .expect(200);
    expect(feedbackList.body).toHaveLength(1);

    const metrics = await http().get(`${playtestsUrl()}/${created.body.id}/metrics`).expect(200);
    expect(metrics.body).toHaveLength(1);
  });

  it('reuses the metric key for a repeated label across sessions', async () => {
    const version = await prototyped();
    const created = await http()
      .post(playtestsUrl())
      .send({ prototypeVersionId: version.id, name: 'First usability pass' })
      .expect(201);

    const first = await http()
      .post(`${playtestsUrl()}/${created.body.id}/metrics`)
      .send({ label: 'Session duration', value: 100 })
      .expect(201);
    const second = await http()
      .post(`${playtestsUrl()}/${created.body.id}/metrics`)
      .send({ label: 'Session duration', value: 200 })
      .expect(201);

    expect(second.body.metricKey).toBe(first.body.metricKey);
  });

  it('returns 404 for an observation entityId from another project', async () => {
    const version = await prototyped();
    const created = await http()
      .post(playtestsUrl())
      .send({ prototypeVersionId: version.id, name: 'First usability pass' })
      .expect(201);
    const foreign = await committed('character', 'Someone else', otherProject.id);

    await http()
      .post(`${playtestsUrl()}/${created.body.id}/observations`)
      .send({ body: 'Mismatched entity', entityId: foreign.id })
      .expect(404);
  });

  it('returns 404 for a sessionId that belongs to a different playtest', async () => {
    const version = await prototyped();
    const playtestA = await http()
      .post(playtestsUrl())
      .send({ prototypeVersionId: version.id, name: 'Playtest A' })
      .expect(201);
    const playtestB = await http()
      .post(playtestsUrl())
      .send({ prototypeVersionId: version.id, name: 'Playtest B' })
      .expect(201);
    const sessionOnA = await http()
      .post(`${playtestsUrl()}/${playtestA.body.id}/sessions`)
      .send({ participant: 'Alex' })
      .expect(201);

    await http()
      .post(`${playtestsUrl()}/${playtestB.body.id}/feedback`)
      .send({ sessionId: sessionOnA.body.id, body: 'Mismatched session' })
      .expect(404);
  });
});

describe('reading a playtest with its sessions and results', () => {
  it('is readable through the API after being written through it', async () => {
    const version = await prototyped();
    const created = await http()
      .post(playtestsUrl())
      .send({
        prototypeVersionId: version.id,
        name: 'First usability pass',
        goal: 'Find the wreck',
      })
      .expect(201);
    const session = await http()
      .post(`${playtestsUrl()}/${created.body.id}/sessions`)
      .send({ participant: 'Alex' })
      .expect(201);
    await http()
      .post(`${playtestsUrl()}/${created.body.id}/observations`)
      .send({ sessionId: session.body.id, body: 'Found the wreck quickly' })
      .expect(201);
    await http()
      .post(`${playtestsUrl()}/${created.body.id}/feedback`)
      .send({ body: 'Fun overall', sentiment: 'positive' })
      .expect(201);
    await http()
      .post(`${playtestsUrl()}/${created.body.id}/metrics`)
      .send({ sessionId: session.body.id, label: 'Completion rate', value: 1, unit: '%' })
      .expect(201);

    const playtest = await http().get(`${playtestsUrl()}/${created.body.id}`).expect(200);
    expect(playtest.body).toMatchObject({ name: 'First usability pass', goal: 'Find the wreck' });

    const sessions = await http().get(`${playtestsUrl()}/${created.body.id}/sessions`).expect(200);
    expect(sessions.body).toHaveLength(1);

    const observations = await http()
      .get(`${playtestsUrl()}/${created.body.id}/observations`)
      .expect(200);
    expect(observations.body).toHaveLength(1);

    const feedback = await http().get(`${playtestsUrl()}/${created.body.id}/feedback`).expect(200);
    expect(feedback.body).toHaveLength(1);

    const metrics = await http().get(`${playtestsUrl()}/${created.body.id}/metrics`).expect(200);
    expect(metrics.body).toHaveLength(1);
  });
});
