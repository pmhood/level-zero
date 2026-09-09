import {
  ActivityService,
  DocumentService,
  EntityService,
  EntityVersionService,
  createProject,
  fixedClock,
  sequentialIdGenerator,
  type DocumentContent,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryActivityRepository,
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
import { DocumentsController } from './documents.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let app: INestApplication;
let entities: EntityService;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projects = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const versionRepo = new InMemoryEntityVersionRepository();

  const activity = new ActivityService(new InMemoryActivityRepository(), deps);
  entities = new EntityService(entityRepo, projects, activity, deps);
  const versions = new EntityVersionService(versionRepo, entityRepo, activity, deps);

  const moduleRef = await Test.createTestingModule({
    controllers: [DocumentsController],
    providers: [
      { provide: DocumentService, useValue: new DocumentService(entities, versions) },
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

const documentsUrl = (projectId = project.id) => `/api/projects/${projectId}/documents`;

/** A body carrying an entity mention — the node a GDD links designs with. */
function withMention(entityId: string): DocumentContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'The diver breathes through ' },
          {
            type: 'entityMention',
            attrs: { entityId, entityType: 'mechanic', label: 'Oxygen Management' },
          },
        ],
      },
    ],
  };
}

function prose(text: string): DocumentContent {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

async function createGdd(): Promise<string> {
  const response = await http()
    .post(documentsUrl())
    .send({ name: 'Game Design Document' })
    .expect(201);

  return response.body.entity.id as string;
}

describe('POST /projects/:projectId/documents', () => {
  it('creates a document entity with an empty body', async () => {
    const response = await http()
      .post(documentsUrl())
      .send({ name: 'Game Design Document', tags: ['design'] })
      .expect(201);

    expect(response.body).toMatchObject({
      entity: { type: 'document', name: 'Game Design Document', tags: ['design'] },
      content: { type: 'doc', content: [] },
      currentVersion: null,
      hasUnversionedChanges: false,
    });
  });

  it('rejects a body that is not a structured document', async () => {
    const response = await http()
      .post(documentsUrl())
      .send({ name: 'Broken', content: { type: 'paragraph' } })
      .expect(400);

    expect(response.body).toMatchObject({ error: 'validation_failed' });
  });

  it('reports an unknown project as missing', async () => {
    await http().post(documentsUrl('missing')).send({ name: 'GDD' }).expect(404);
  });
});

describe('GET /projects/:projectId/documents', () => {
  it('lists the project documents and nothing else', async () => {
    await createGdd();
    await entities.create(project.id, { type: 'character', name: 'Kael' });

    const response = await http().get(documentsUrl()).expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0]).toMatchObject({ type: 'document' });
  });

  it('does not read another project documents', async () => {
    await createGdd();

    await expect(http().get(documentsUrl(otherProject.id)).expect(200)).resolves.toMatchObject({
      body: { total: 0 },
    });
  });
});

describe('autosave and reload', () => {
  it('keeps the structured body across a reload', async () => {
    const documentId = await createGdd();

    await http()
      .put(`${documentsUrl()}/${documentId}/content`)
      .send({ content: withMention('mechanic-1') })
      .expect(200);

    const reloaded = await http().get(`${documentsUrl()}/${documentId}`).expect(200);
    expect(reloaded.body.content).toEqual(withMention('mechanic-1'));
  });

  it('does not add to the version history', async () => {
    const documentId = await createGdd();

    for (const text of ['A', 'A d', 'A diver']) {
      await http()
        .put(`${documentsUrl()}/${documentId}/content`)
        .send({ content: prose(text) })
        .expect(200);
    }

    const history = await http().get(`${documentsUrl()}/${documentId}/versions`).expect(200);
    expect(history.body).toMatchObject({ total: 0, versions: [], currentVersionId: null });
  });

  it('refuses a document id that is not a document', async () => {
    const kael = await entities.create(project.id, { type: 'character', name: 'Kael' });

    await http()
      .put(`${documentsUrl()}/${kael.id}/content`)
      .send({ content: prose('Nope.') })
      .expect(400);
  });
});

describe('versions', () => {
  it('creates, lists and restores a named version', async () => {
    const documentId = await createGdd();

    await http()
      .put(`${documentsUrl()}/${documentId}/content`)
      .send({ content: withMention('mechanic-1') })
      .expect(200);
    const first = await http()
      .post(`${documentsUrl()}/${documentId}/versions`)
      .send({ name: 'Pillars locked', reason: 'milestone', createdBy: 'ana' })
      .expect(201);

    expect(first.body).toMatchObject({
      versionNumber: 1,
      name: 'Pillars locked',
      reason: 'milestone',
      createdBy: 'ana',
      isCurrent: true,
    });

    await http()
      .put(`${documentsUrl()}/${documentId}/content`)
      .send({ content: prose('Oxygen cut.') })
      .expect(200);
    await http().post(`${documentsUrl()}/${documentId}/versions`).send({ name: 'Without' });

    const restored = await http()
      .post(`${documentsUrl()}/${documentId}/versions/${first.body.id}/restore`)
      .send({})
      .expect(201);

    expect(restored.body).toMatchObject({ versionNumber: 3, reason: 'restore', isCurrent: true });

    const history = await http().get(`${documentsUrl()}/${documentId}/versions`).expect(200);
    expect(history.body.total).toBe(3);

    const reloaded = await http().get(`${documentsUrl()}/${documentId}`).expect(200);
    expect(reloaded.body.content).toEqual(withMention('mechanic-1'));
    expect(reloaded.body.hasUnversionedChanges).toBe(false);
  });

  it('rejects a reason that is not a document event', async () => {
    const documentId = await createGdd();

    await http()
      .post(`${documentsUrl()}/${documentId}/versions`)
      .send({ reason: 'branch' })
      .expect(400);
  });

  it('reads one version with the body it holds', async () => {
    const documentId = await createGdd();
    await http()
      .put(`${documentsUrl()}/${documentId}/content`)
      .send({ content: withMention('mechanic-1') });
    const version = await http().post(`${documentsUrl()}/${documentId}/versions`).send({});

    await http()
      .put(`${documentsUrl()}/${documentId}/content`)
      .send({ content: prose('Later.') });

    const response = await http()
      .get(`${documentsUrl()}/${documentId}/versions/${version.body.id}`)
      .expect(200);

    expect(response.body.content).toEqual(withMention('mechanic-1'));
  });

  it('compares two versions for a side-by-side view', async () => {
    const documentId = await createGdd();
    await http()
      .put(`${documentsUrl()}/${documentId}/content`)
      .send({ content: withMention('mechanic-1') });
    const first = await http().post(`${documentsUrl()}/${documentId}/versions`).send({});

    await http()
      .put(`${documentsUrl()}/${documentId}/content`)
      .send({ content: prose('Cut.') });
    const second = await http().post(`${documentsUrl()}/${documentId}/versions`).send({});

    const response = await http()
      .get(`${documentsUrl()}/${documentId}/versions/compare`)
      .query({ from: first.body.id, to: second.body.id })
      .expect(200);

    expect(response.body).toMatchObject({
      contentChanged: true,
      changes: [],
      from: { content: withMention('mechanic-1') },
      to: { content: prose('Cut.') },
    });
  });

  it('refuses a version belonging to another document', async () => {
    const documentId = await createGdd();
    const other = await http().post(documentsUrl()).send({ name: 'Brief' }).expect(201);
    const version = await http()
      .post(`${documentsUrl()}/${other.body.entity.id}/versions`)
      .send({});

    await http()
      .post(`${documentsUrl()}/${documentId}/versions/${version.body.id}/restore`)
      .send({})
      .expect(400);
  });
});
