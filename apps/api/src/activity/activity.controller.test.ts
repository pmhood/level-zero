import {
  ActivityService,
  EntityService,
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
import { ActivityController } from './activity.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let app: INestApplication;
let entities: EntityService;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projects = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const activityService = new ActivityService(new InMemoryActivityRepository(), deps);

  entities = new EntityService(entityRepo, projects, activityService, deps);

  const moduleRef = await Test.createTestingModule({
    controllers: [ActivityController],
    providers: [
      { provide: ActivityService, useValue: activityService },
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

describe('reading the feed', () => {
  it('lists meaningful entity activity, newest first', async () => {
    const kael = await entities.create(project.id, { type: 'character', name: 'Kael' });
    await entities.archive(project.id, kael.id);

    const response = await http().get(`/api/projects/${project.id}/activity`).expect(200);

    expect(response.body.total).toBe(2);
    expect(response.body.items.map((item: { type: string }) => item.type)).toEqual([
      'entity_archived',
      'entity_created',
    ]);
  });

  it('never returns another project activity', async () => {
    await entities.create(project.id, { type: 'character', name: 'Kael' });
    await entities.create(otherProject.id, { type: 'character', name: 'Someone else' });

    const response = await http().get(`/api/projects/${project.id}/activity`).expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0]).toMatchObject({ summary: 'Kael created' });
  });

  it('filters by type', async () => {
    const kael = await entities.create(project.id, { type: 'character', name: 'Kael' });
    await entities.archive(project.id, kael.id);

    const response = await http()
      .get(`/api/projects/${project.id}/activity`)
      .query({ type: 'entity_archived' })
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0]).toMatchObject({ type: 'entity_archived' });
  });
});
