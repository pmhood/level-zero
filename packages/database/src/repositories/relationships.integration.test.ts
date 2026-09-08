import {
  ConflictError,
  EntityRelationshipService,
  EntityService,
  LineageService,
  NotFoundError,
  ProjectService,
  createProject,
  systemClock,
  uuidIdGenerator,
  type Entity,
  type EntityType,
  type Project,
} from '@level-zero/domain';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DatabaseClient } from '../postgres/client';
import { connectTestDatabase, truncateDomainTables } from '../testing/test-database';
import { DrizzleEntityRelationshipRepository } from './entity-relationship-repository';
import { DrizzleEntityRepository } from './entity-repository';
import { DrizzleProjectRepository } from './project-repository';

const deps = { clock: systemClock, ids: uuidIdGenerator };

/**
 * Drizzle wraps driver errors, so the Postgres SQLSTATE lives on the cause
 * chain rather than in the message.
 */
async function expectPostgresError(operation: Promise<unknown>, code: string): Promise<void> {
  let thrown: unknown;
  try {
    await operation;
  } catch (error) {
    thrown = error;
  }

  const codes: string[] = [];
  for (let error = thrown; error instanceof Error; error = error.cause) {
    const candidate = (error as Error & { code?: string }).code;
    if (candidate) codes.push(candidate);
  }

  expect(thrown, 'expected the statement to be rejected').toBeInstanceOf(Error);
  expect(codes).toContain(code);
}

let client: DatabaseClient;
let projectRepo: DrizzleProjectRepository;
let relationshipRepo: DrizzleEntityRelationshipRepository;
let entities: EntityService;
let relationships: EntityRelationshipService;
let lineage: LineageService;
let projectA: Project;
let projectB: Project;

beforeAll(() => {
  client = connectTestDatabase();
  projectRepo = new DrizzleProjectRepository(client.db);
  const entityRepo = new DrizzleEntityRepository(client.db);
  relationshipRepo = new DrizzleEntityRelationshipRepository(client.db);

  entities = new EntityService(entityRepo, projectRepo, deps);
  relationships = new EntityRelationshipService(relationshipRepo, entityRepo, deps);
  lineage = new LineageService(entities, relationships);
  void new ProjectService(projectRepo, deps);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await truncateDomainTables(client);
  projectA = await projectRepo.insert(createProject({ name: 'Deep Fathom' }, deps));
  projectB = await projectRepo.insert(createProject({ name: 'Sky Wreck' }, deps));
});

function entity(project: Project, type: EntityType, name: string): Promise<Entity> {
  return entities.create(project.id, { type, name });
}

describe('relationship round trips', () => {
  it('links a character to four different kinds of entity', async () => {
    const kael = await entity(projectA, 'character', 'Kael');
    for (const [type, name] of [
      ['faction', 'The Tide'],
      ['location', 'Fathom Station'],
      ['mechanic', 'Oxygen Management'],
      ['asset_reference', 'Kael portrait'],
    ] as const) {
      const target = await entity(projectA, type, name);
      await relationships.link(projectA.id, {
        sourceEntityId: kael.id,
        targetEntityId: target.id,
        relation: 'references',
        metadata: { note: `link to ${name}` },
      });
    }

    const graph = await relationships.neighborhood(projectA.id, kael.id);

    expect(graph.outgoing).toHaveLength(4);
    expect(graph.outgoing[0]?.relationship.metadata).toHaveProperty('note');
  });

  it('separates incoming and outgoing edges and filters by relation', async () => {
    const [idea, mechanic, scene] = [
      await entity(projectA, 'idea', 'Oxygen is currency'),
      await entity(projectA, 'mechanic', 'Oxygen Management'),
      await entity(projectA, 'scene', 'The Dive'),
    ];
    await relationships.link(projectA.id, {
      sourceEntityId: mechanic.id,
      targetEntityId: idea.id,
      relation: 'derived_from',
    });
    await relationships.link(projectA.id, {
      sourceEntityId: scene.id,
      targetEntityId: mechanic.id,
      relation: 'implements',
    });

    const graph = await relationships.neighborhood(projectA.id, mechanic.id);
    expect(graph.outgoing.map((edge) => edge.entity.name)).toEqual(['Oxygen is currency']);
    expect(graph.incoming.map((edge) => edge.entity.name)).toEqual(['The Dive']);

    await expect(
      relationships.listForEntity(projectA.id, mechanic.id, { relations: ['implements'] }),
    ).resolves.toMatchObject({ total: 1 });
  });
});

describe('constraints enforced by the database', () => {
  it('refuses a cross-project edge even when the service check is bypassed', async () => {
    const kael = await entity(projectA, 'character', 'Kael');
    const skyCult = await entity(projectB, 'faction', 'Sky Cult');

    // Straight at the repository: the composite foreign keys are the guarantee,
    // not the service-level lookup.
    await expectPostgresError(
      relationshipRepo.insert({
        id: uuidIdGenerator.next(),
        projectId: projectA.id,
        sourceEntityId: kael.id,
        targetEntityId: skyCult.id,
        relation: 'belongs_to',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      '23503',
    );
  });

  it('refuses a duplicate edge at the repository level', async () => {
    const [a, b] = [
      await entity(projectA, 'character', 'Kael'),
      await entity(projectA, 'faction', 'The Tide'),
    ];
    const link = { sourceEntityId: a.id, targetEntityId: b.id, relation: 'belongs_to' as const };
    await relationships.link(projectA.id, link);

    await expect(relationships.link(projectA.id, link)).rejects.toThrow(ConflictError);
  });

  it('refuses a self-referencing edge', async () => {
    const kael = await entity(projectA, 'character', 'Kael');

    await expectPostgresError(
      relationshipRepo.insert({
        id: uuidIdGenerator.next(),
        projectId: projectA.id,
        sourceEntityId: kael.id,
        targetEntityId: kael.id,
        relation: 'references',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      '23514',
    );
  });
});

describe('lineage survives archiving and deletion', () => {
  it('keeps edges when an endpoint is archived', async () => {
    const [idea, mechanic] = [
      await entity(projectA, 'idea', 'Oxygen is currency'),
      await entity(projectA, 'mechanic', 'Oxygen Management'),
    ];
    await relationships.link(projectA.id, {
      sourceEntityId: mechanic.id,
      targetEntityId: idea.id,
      relation: 'derived_from',
    });

    await entities.archive(projectA.id, idea.id);

    const graph = await relationships.neighborhood(projectA.id, mechanic.id);
    expect(graph.outgoing).toHaveLength(1);
    expect(graph.outgoing[0]?.entity.status).toBe('archived');
  });

  it('refuses to delete an entity that lineage points at', async () => {
    const [idea, mechanic] = [
      await entity(projectA, 'idea', 'Oxygen is currency'),
      await entity(projectA, 'mechanic', 'Oxygen Management'),
    ];
    await relationships.link(projectA.id, {
      sourceEntityId: mechanic.id,
      targetEntityId: idea.id,
      relation: 'derived_from',
    });

    await expectPostgresError(
      client.db.execute(sql`delete from entities where id = ${idea.id}`),
      '23503',
    );
  });

  it('still allows a whole project to be removed', async () => {
    const [idea, mechanic] = [
      await entity(projectA, 'idea', 'Oxygen is currency'),
      await entity(projectA, 'mechanic', 'Oxygen Management'),
    ];
    await relationships.link(projectA.id, {
      sourceEntityId: mechanic.id,
      targetEntityId: idea.id,
      relation: 'derived_from',
    });

    await client.db.execute(sql`delete from projects where id = ${projectA.id}`);

    const remaining = await client.db.execute<{ count: number }>(
      sql`select count(*)::int as count from entity_relationships`,
    );
    expect(Number(remaining.rows[0]?.count)).toBe(0);
  });

  it('refuses to unlink a lineage edge but allows a structural one', async () => {
    const [kael, station, idea] = [
      await entity(projectA, 'character', 'Kael'),
      await entity(projectA, 'location', 'Fathom Station'),
      await entity(projectA, 'idea', 'Oxygen is currency'),
    ];
    const structural = await relationships.link(projectA.id, {
      sourceEntityId: kael.id,
      targetEntityId: station.id,
      relation: 'appears_in',
    });
    const historical = await relationships.link(projectA.id, {
      sourceEntityId: kael.id,
      targetEntityId: idea.id,
      relation: 'inspired_by',
    });

    await relationships.unlink(projectA.id, structural.id);
    await expect(relationships.unlink(projectA.id, historical.id)).rejects.toThrow(ConflictError);
    await expect(relationships.getById(projectA.id, historical.id)).resolves.toBeTruthy();
  });
});

describe('lineage workflows over Postgres', () => {
  it('promotes an idea into a mechanic and records the source relationship', async () => {
    const idea = await entities.create(projectA.id, {
      type: 'idea',
      name: 'Oxygen is currency',
      tags: ['Survival'],
    });

    const { promoted } = await lineage.promote(projectA.id, idea.id, { type: 'mechanic' });

    const graph = await relationships.neighborhood(projectA.id, promoted.id);
    expect(graph.incoming).toHaveLength(1);
    expect(graph.incoming[0]).toMatchObject({
      relationship: { relation: 'promoted_to' },
      entity: { id: idea.id, type: 'idea' },
    });

    // The idea is untouched.
    await expect(entities.getById(projectA.id, idea.id)).resolves.toMatchObject({
      type: 'idea',
      name: 'Oxygen is currency',
    });
  });

  it('traces a generated concept back to what influenced it', async () => {
    const [board, kael, concept] = [
      await entity(projectA, 'asset_reference', 'Mood board: trench'),
      await entity(projectA, 'character', 'Kael'),
      await entity(projectA, 'asset_reference', 'Kael concept 01'),
    ];

    await lineage.recordGeneratedFrom(projectA.id, concept.id, [board.id, kael.id], {
      capability: 'image.generate',
    });

    const graph = await relationships.neighborhood(projectA.id, concept.id, {
      relations: ['generated_from'],
    });

    expect(graph.outgoing.map((edge) => edge.entity.name).sort()).toEqual([
      'Kael',
      'Mood board: trench',
    ]);
  });

  it('refuses to promote through the wrong project', async () => {
    const idea = await entity(projectA, 'idea', 'Oxygen is currency');

    await expect(lineage.promote(projectB.id, idea.id, { type: 'mechanic' })).rejects.toThrow(
      NotFoundError,
    );
  });
});
