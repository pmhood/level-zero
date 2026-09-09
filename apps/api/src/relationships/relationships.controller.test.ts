import {
  ActivityService,
  EntityRelationshipService,
  EntityService,
  LineageService,
  ProjectService,
  createProject,
  fixedClock,
  sequentialIdGenerator,
  type Entity,
  type EntityType,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryActivityRepository,
  InMemoryEntityRelationshipRepository,
  InMemoryEntityRepository,
  InMemoryProjectRepository,
} from '@level-zero/domain/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { RelationshipsController } from './relationships.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let app: INestApplication;
let entities: EntityService;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projectRepo = new InMemoryProjectRepository();
  const entityRepo = new InMemoryEntityRepository();
  const relationshipRepo = new InMemoryEntityRelationshipRepository();

  const activity = new ActivityService(new InMemoryActivityRepository(), deps);
  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  const relationships = new EntityRelationshipService(relationshipRepo, entityRepo, deps);
  const lineage = new LineageService(entities, relationships, activity);

  const moduleRef = await Test.createTestingModule({
    controllers: [RelationshipsController],
    providers: [
      { provide: EntityRelationshipService, useValue: relationships },
      { provide: LineageService, useValue: lineage },
      { provide: ProjectService, useValue: new ProjectService(projectRepo, deps) },
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

function entity(target: Project, type: EntityType, name: string): Promise<Entity> {
  return entities.create(target.id, { type, name });
}

describe('POST relationships', () => {
  it('links two entities', async () => {
    const [kael, faction] = [
      await entity(project, 'character', 'Kael'),
      await entity(project, 'faction', 'The Tide'),
    ];

    const response = await http()
      .post(`/api/projects/${project.id}/entities/${kael.id}/relationships`)
      .send({ targetEntityId: faction.id, relation: 'belongs_to', metadata: { since: 'act 1' } })
      .expect(201);

    expect(response.body).toMatchObject({
      sourceEntityId: kael.id,
      targetEntityId: faction.id,
      relation: 'belongs_to',
      metadata: { since: 'act 1' },
    });
  });

  it('rejects an unknown relation type', async () => {
    const [kael, faction] = [
      await entity(project, 'character', 'Kael'),
      await entity(project, 'faction', 'The Tide'),
    ];

    await http()
      .post(`/api/projects/${project.id}/entities/${kael.id}/relationships`)
      .send({ targetEntityId: faction.id, relation: 'befriends' })
      .expect(400);
  });

  it('returns 404 when the target belongs to another project', async () => {
    const kael = await entity(project, 'character', 'Kael');
    const foreign = await entity(otherProject, 'faction', 'Sky Cult');

    const response = await http()
      .post(`/api/projects/${project.id}/entities/${kael.id}/relationships`)
      .send({ targetEntityId: foreign.id, relation: 'belongs_to' })
      .expect(404);

    expect(response.body).toMatchObject({ error: 'not_found' });
  });

  it('returns 409 for a duplicate edge', async () => {
    const [kael, faction] = [
      await entity(project, 'character', 'Kael'),
      await entity(project, 'faction', 'The Tide'),
    ];
    const body = { targetEntityId: faction.id, relation: 'belongs_to' };

    await http()
      .post(`/api/projects/${project.id}/entities/${kael.id}/relationships`)
      .send(body)
      .expect(201);
    await http()
      .post(`/api/projects/${project.id}/entities/${kael.id}/relationships`)
      .send(body)
      .expect(409);
  });

  it('returns 400 for a self-link', async () => {
    const kael = await entity(project, 'character', 'Kael');

    await http()
      .post(`/api/projects/${project.id}/entities/${kael.id}/relationships`)
      .send({ targetEntityId: kael.id, relation: 'references' })
      .expect(400);
  });
});

describe('GET relationships', () => {
  it('returns the entity neighbourhood with both directions resolved', async () => {
    const [idea, mechanic, scene] = [
      await entity(project, 'idea', 'Oxygen is currency'),
      await entity(project, 'mechanic', 'Oxygen Management'),
      await entity(project, 'scene', 'The Dive'),
    ];
    await http()
      .post(`/api/projects/${project.id}/entities/${mechanic.id}/relationships`)
      .send({ targetEntityId: idea.id, relation: 'derived_from' })
      .expect(201);
    await http()
      .post(`/api/projects/${project.id}/entities/${scene.id}/relationships`)
      .send({ targetEntityId: mechanic.id, relation: 'implements' })
      .expect(201);

    const response = await http()
      .get(`/api/projects/${project.id}/entities/${mechanic.id}/relationships`)
      .expect(200);

    expect(response.body.entity.id).toBe(mechanic.id);
    expect(response.body.outgoing).toHaveLength(1);
    expect(response.body.outgoing[0].entity.name).toBe('Oxygen is currency');
    expect(response.body.incoming[0].entity.name).toBe('The Dive');
  });

  it('filters by direction and relation', async () => {
    const [kael, faction, station] = [
      await entity(project, 'character', 'Kael'),
      await entity(project, 'faction', 'The Tide'),
      await entity(project, 'location', 'Fathom Station'),
    ];
    for (const [target, relation] of [
      [faction, 'belongs_to'],
      [station, 'appears_in'],
    ] as const) {
      await http()
        .post(`/api/projects/${project.id}/entities/${kael.id}/relationships`)
        .send({ targetEntityId: target.id, relation })
        .expect(201);
    }

    const filtered = await http()
      .get(`/api/projects/${project.id}/entities/${kael.id}/relationships?relation=belongs_to`)
      .expect(200);
    expect(filtered.body.outgoing).toHaveLength(1);

    const incoming = await http()
      .get(`/api/projects/${project.id}/entities/${kael.id}/relationships?direction=incoming`)
      .expect(200);
    expect(incoming.body.outgoing).toHaveLength(0);
  });

  it('returns 404 for an entity in another project', async () => {
    const kael = await entity(project, 'character', 'Kael');

    await http()
      .get(`/api/projects/${otherProject.id}/entities/${kael.id}/relationships`)
      .expect(404);
  });

  it('rejects an unknown direction', async () => {
    const kael = await entity(project, 'character', 'Kael');

    await http()
      .get(`/api/projects/${project.id}/entities/${kael.id}/relationships?direction=sideways`)
      .expect(400);
  });
});

describe('DELETE relationships', () => {
  it('removes a structural link', async () => {
    const [kael, station] = [
      await entity(project, 'character', 'Kael'),
      await entity(project, 'location', 'Fathom Station'),
    ];
    const created = await http()
      .post(`/api/projects/${project.id}/entities/${kael.id}/relationships`)
      .send({ targetEntityId: station.id, relation: 'appears_in' })
      .expect(201);

    await http()
      .delete(`/api/projects/${project.id}/entities/${kael.id}/relationships/${created.body.id}`)
      .expect(204);

    const graph = await http()
      .get(`/api/projects/${project.id}/entities/${kael.id}/relationships`)
      .expect(200);
    expect(graph.body.outgoing).toHaveLength(0);
  });

  it('refuses to remove a lineage edge', async () => {
    const [mechanic, idea] = [
      await entity(project, 'mechanic', 'Oxygen Management'),
      await entity(project, 'idea', 'Oxygen is currency'),
    ];
    const created = await http()
      .post(`/api/projects/${project.id}/entities/${mechanic.id}/relationships`)
      .send({ targetEntityId: idea.id, relation: 'derived_from' })
      .expect(201);

    const response = await http()
      .delete(
        `/api/projects/${project.id}/entities/${mechanic.id}/relationships/${created.body.id}`,
      )
      .expect(409);

    expect(response.body.message).toMatch(/lineage/);
  });
});

describe('POST promote', () => {
  it('promotes an idea to a mechanic and records the lineage', async () => {
    const idea = await entity(project, 'idea', 'Oxygen is currency');

    const response = await http()
      .post(`/api/projects/${project.id}/entities/${idea.id}/promote`)
      .send({ type: 'mechanic' })
      .expect(201);

    expect(response.body.promoted).toMatchObject({ type: 'mechanic', name: 'Oxygen is currency' });
    expect(response.body.relationship).toMatchObject({
      sourceEntityId: idea.id,
      relation: 'promoted_to',
    });

    const graph = await http()
      .get(`/api/projects/${project.id}/entities/${idea.id}/relationships`)
      .expect(200);
    expect(graph.body.outgoing[0].entity.type).toBe('mechanic');
  });

  it('leaves the source idea intact', async () => {
    const idea = await entity(project, 'idea', 'Oxygen is currency');

    await http()
      .post(`/api/projects/${project.id}/entities/${idea.id}/promote`)
      .send({ type: 'character', name: 'The Air Broker' })
      .expect(201);

    await expect(entities.getById(project.id, idea.id)).resolves.toMatchObject({
      type: 'idea',
      name: 'Oxygen is currency',
    });
  });

  it('rejects promoting to the same type', async () => {
    const idea = await entity(project, 'idea', 'Oxygen is currency');

    await http()
      .post(`/api/projects/${project.id}/entities/${idea.id}/promote`)
      .send({ type: 'idea' })
      .expect(400);
  });

  it('rejects an unknown target type', async () => {
    const idea = await entity(project, 'idea', 'Oxygen is currency');

    await http()
      .post(`/api/projects/${project.id}/entities/${idea.id}/promote`)
      .send({ type: 'spaceship' })
      .expect(400);
  });

  it('returns 404 when promoting through another project', async () => {
    const idea = await entity(project, 'idea', 'Oxygen is currency');

    await http()
      .post(`/api/projects/${otherProject.id}/entities/${idea.id}/promote`)
      .send({ type: 'mechanic' })
      .expect(404);
  });
});
