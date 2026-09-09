import {
  ActivityService,
  EntityService,
  ProjectService,
  createProject,
  fixedClock,
  sequentialIdGenerator,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryActivityRepository,
  InMemoryEntityRepository,
  InMemoryProjectRepository,
} from '@level-zero/domain/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { ProjectsController } from '../projects/projects.controller';
import { EntitiesController } from './entities.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let app: INestApplication;
let projectService: ProjectService;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projects = new InMemoryProjectRepository();
  const entities = new InMemoryEntityRepository();
  projectService = new ProjectService(projects, deps);
  const activity = new ActivityService(new InMemoryActivityRepository(), deps);
  const entityService = new EntityService(entities, projects, activity, deps);

  const moduleRef = await Test.createTestingModule({
    controllers: [ProjectsController, EntitiesController],
    providers: [
      { provide: ProjectService, useValue: projectService },
      { provide: EntityService, useValue: entityService },
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

describe('projects endpoints', () => {
  it('creates a project', async () => {
    const response = await http().post('/api/projects').send({ name: 'New Game' }).expect(201);

    expect(response.body).toMatchObject({ name: 'New Game', status: 'active' });
    expect(response.body.id).toEqual(expect.any(String));
  });

  it('rejects a blank name with the domain error code', async () => {
    const response = await http().post('/api/projects').send({ name: '   ' }).expect(400);

    expect(response.body).toMatchObject({ error: 'validation_failed' });
  });

  it('rejects a request whose shape is wrong before it reaches the domain', async () => {
    await http().post('/api/projects').send({ name: 42 }).expect(400);
  });

  it('strips unknown properties instead of storing them', async () => {
    const response = await http()
      .post('/api/projects')
      .send({ name: 'New Game', sneaky: 'value' })
      .expect(201);

    expect(response.body.sneaky).toBeUndefined();
  });

  it('returns 404 for a project that does not exist', async () => {
    const response = await http().get('/api/projects/missing').expect(404);

    expect(response.body).toMatchObject({ error: 'not_found' });
  });

  it('archives a project', async () => {
    await http().post(`/api/projects/${project.id}/archive`).expect(201);

    const response = await http().get(`/api/projects/${project.id}`).expect(200);
    expect(response.body.status).toBe('archived');
  });
});

describe('entities endpoints', () => {
  it('creates entities of different types under a project', async () => {
    const idea = await http()
      .post(`/api/projects/${project.id}/entities`)
      .send({ type: 'idea', name: 'Oxygen is currency' })
      .expect(201);
    const character = await http()
      .post(`/api/projects/${project.id}/entities`)
      .send({ type: 'character', name: 'Kael', tags: ['Protagonist'], data: { age: 34 } })
      .expect(201);

    expect(idea.body).toMatchObject({ type: 'idea', status: 'draft', projectId: project.id });
    expect(character.body).toMatchObject({ tags: ['Protagonist'], data: { age: 34 } });
  });

  it('rejects an unknown entity type', async () => {
    await http()
      .post(`/api/projects/${project.id}/entities`)
      .send({ type: 'spaceship', name: 'x' })
      .expect(400);
  });

  it('returns 404 when the project does not exist', async () => {
    await http()
      .post('/api/projects/missing/entities')
      .send({ type: 'idea', name: 'x' })
      .expect(404);
  });

  it('returns 409 when the project is archived', async () => {
    await projectService.archive(project.id);

    const response = await http()
      .post(`/api/projects/${project.id}/entities`)
      .send({ type: 'idea', name: 'x' })
      .expect(409);

    expect(response.body).toMatchObject({ error: 'conflict' });
  });

  it('reads an entity back through its project', async () => {
    const created = await http()
      .post(`/api/projects/${project.id}/entities`)
      .send({ type: 'character', name: 'Kael' })
      .expect(201);

    const response = await http()
      .get(`/api/projects/${project.id}/entities/${created.body.id}`)
      .expect(200);

    expect(response.body.name).toBe('Kael');
  });

  it('returns 404 when the entity is read through another project', async () => {
    const created = await http()
      .post(`/api/projects/${project.id}/entities`)
      .send({ type: 'character', name: 'Kael' })
      .expect(201);

    await http().get(`/api/projects/${otherProject.id}/entities/${created.body.id}`).expect(404);
  });

  it('updates and archives an entity', async () => {
    const created = await http()
      .post(`/api/projects/${project.id}/entities`)
      .send({ type: 'character', name: 'Kael' })
      .expect(201);

    const updated = await http()
      .patch(`/api/projects/${project.id}/entities/${created.body.id}`)
      .send({ name: 'Kael Vex', status: 'active' })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Kael Vex', status: 'active' });

    await http()
      .post(`/api/projects/${project.id}/entities/${created.body.id}/archive`)
      .expect(201);

    const listed = await http().get(`/api/projects/${project.id}/entities`).expect(200);
    expect(listed.body.total).toBe(0);
  });

  it('refuses to archive an entity through another project', async () => {
    const created = await http()
      .post(`/api/projects/${project.id}/entities`)
      .send({ type: 'character', name: 'Kael' })
      .expect(201);

    await http()
      .post(`/api/projects/${otherProject.id}/entities/${created.body.id}/archive`)
      .expect(404);
  });
});

describe('entity listing query parameters', () => {
  beforeEach(async () => {
    for (const body of [
      { type: 'character', name: 'Kael', tags: ['Protagonist'] },
      { type: 'character', name: 'Riven', tags: ['Antagonist'] },
      { type: 'mechanic', name: 'Oxygen Management', tags: ['core'], status: 'active' },
    ]) {
      await http().post(`/api/projects/${project.id}/entities`).send(body).expect(201);
    }
  });

  it('filters by type', async () => {
    const response = await http()
      .get(`/api/projects/${project.id}/entities`)
      .query({ type: 'character' })
      .expect(200);

    expect(response.body.total).toBe(2);
  });

  it('accepts a comma-separated type list', async () => {
    const response = await http()
      .get(`/api/projects/${project.id}/entities?type=character,mechanic`)
      .expect(200);

    expect(response.body.total).toBe(3);
  });

  it('accepts a repeated tag parameter', async () => {
    const response = await http()
      .get(`/api/projects/${project.id}/entities?tag=protagonist&tag=antagonist`)
      .expect(200);

    expect(response.body.total).toBe(2);
  });

  it('filters by status and searches text', async () => {
    await expect(
      http().get(`/api/projects/${project.id}/entities?status=active`).expect(200),
    ).resolves.toMatchObject({ body: { total: 1 } });
    await expect(
      http().get(`/api/projects/${project.id}/entities?search=oxygen`).expect(200),
    ).resolves.toMatchObject({ body: { total: 1 } });
  });

  it('never returns another project entities', async () => {
    const response = await http().get(`/api/projects/${otherProject.id}/entities`).expect(200);

    expect(response.body.total).toBe(0);
  });

  it('rejects an unknown type filter', async () => {
    await http().get(`/api/projects/${project.id}/entities?type=spaceship`).expect(400);
  });

  it('rejects an oversized page', async () => {
    await http().get(`/api/projects/${project.id}/entities?limit=500`).expect(400);
  });
});
