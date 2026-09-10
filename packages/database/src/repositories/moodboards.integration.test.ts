import {
  ActivityService,
  AssetService,
  ConflictError,
  EntityRelationshipService,
  EntityService,
  MoodboardService,
  ProjectService,
  systemClock,
  uuidIdGenerator,
  type Asset,
  type Entity,
  type MoodboardNode,
  type Project,
} from '@level-zero/domain';
import { InMemoryObjectStorageProvider } from '@level-zero/domain/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DatabaseClient } from '../postgres/client';
import { connectTestDatabase, truncateDomainTables } from '../testing/test-database';
import { DrizzleActivityRepository } from './activity-repository';
import { DrizzleAssetRepository } from './asset-repository';
import { DrizzleEntityRelationshipRepository } from './entity-relationship-repository';
import { DrizzleEntityRepository } from './entity-repository';
import { DrizzleMoodboardRepository } from './moodboard-repository';
import { DrizzleProjectRepository } from './project-repository';

const deps = { clock: systemClock, ids: uuidIdGenerator };

let client: DatabaseClient;
let boardRepo: DrizzleMoodboardRepository;
let projects: ProjectService;
let entities: EntityService;
let assets: AssetService;
let relationships: EntityRelationshipService;
let moodboards: MoodboardService;
let project: Project;
let otherProject: Project;
let board: Entity;

beforeAll(async () => {
  client = await connectTestDatabase();
  const projectRepo = new DrizzleProjectRepository(client.db);
  const entityRepo = new DrizzleEntityRepository(client.db);
  const assetRepo = new DrizzleAssetRepository(client.db);
  const relationshipRepo = new DrizzleEntityRelationshipRepository(client.db);
  boardRepo = new DrizzleMoodboardRepository(client.db);

  const activity = new ActivityService(new DrizzleActivityRepository(client.db), deps);

  projects = new ProjectService(projectRepo, deps);
  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  assets = new AssetService(assetRepo, projectRepo, new InMemoryObjectStorageProvider(), deps);
  relationships = new EntityRelationshipService(relationshipRepo, entityRepo, deps);
  moodboards = new MoodboardService(boardRepo, entities, assetRepo, relationships, deps);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await truncateDomainTables(client);
  project = await projects.create({ name: 'Deep Fathom' });
  otherProject = await projects.create({ name: 'Sky Wreck' });
  board = await entities.create(project.id, { type: 'moodboard', name: 'Wreck interiors' });
});

function image(name = 'reef.png', projectId = project.id): Promise<Asset> {
  return assets.upload(projectId, {
    kind: 'image',
    filename: name,
    mimeType: 'image/png',
    content: Buffer.from(name),
  });
}

describe('moodboard layout storage', () => {
  it('round-trips every layout field through Postgres', async () => {
    const asset = await image();

    const placed = await moodboards.addNode(project.id, board.id, {
      type: 'asset',
      assetId: asset.id,
      x: -240.75,
      y: 610.25,
      width: 480,
      height: 270,
      rotation: 1.0471975511965976,
      zOrder: 4,
      locked: true,
      data: { caption: 'wet steel' },
    });

    const reopened = await moodboards.open(project.id, board.id);
    expect(reopened.nodes).toEqual([placed]);
  });

  it('orders nodes back to front', async () => {
    const first = await moodboards.addNode(project.id, board.id, { type: 'note', zOrder: 5 });
    const second = await moodboards.addNode(project.id, board.id, { type: 'text', zOrder: 1 });

    const { nodes } = await moodboards.open(project.id, board.id);

    expect(nodes.map((node) => node.id)).toEqual([second.id, first.id]);
  });

  it('never reads another project’s board', async () => {
    await moodboards.addNode(project.id, board.id, { type: 'note' });

    expect(await boardRepo.listNodes(otherProject.id, board.id)).toEqual([]);
  });
});

describe('reference integrity in the database', () => {
  it('keeps one asset row behind placements on two boards', async () => {
    const asset = await image();
    const second = await entities.create(project.id, { type: 'moodboard', name: 'Palette study' });

    await moodboards.addNode(project.id, board.id, { type: 'asset', assetId: asset.id });
    await moodboards.addNode(project.id, second.id, { type: 'asset', assetId: asset.id });

    const assetRows = await client.db.execute<{ total: number }>(
      sql`select count(*)::int as total from assets where project_id = ${project.id}`,
    );
    expect(Number(assetRows.rows[0]?.total)).toBe(1);
  });

  it('refuses to delete an asset a board is showing', async () => {
    const asset = await image();
    await moodboards.addNode(project.id, board.id, { type: 'asset', assetId: asset.id });

    await expectPostgresError(
      client.db.execute(sql`delete from assets where id = ${asset.id}`),
      FOREIGN_KEY_VIOLATION,
    );
  });

  it('refuses to delete an entity a board is showing', async () => {
    const character = await entities.create(project.id, { type: 'character', name: 'Tam' });
    await moodboards.addNode(project.id, board.id, { type: 'entity', entityId: character.id });

    await expectPostgresError(
      client.db.execute(sql`delete from entities where id = ${character.id}`),
      FOREIGN_KEY_VIOLATION,
    );
  });

  it('cannot place another project’s entity, even bypassing the service', async () => {
    const foreign = await entities.create(otherProject.id, { type: 'location', name: 'Elsewhere' });

    await expectPostgresError(
      client.db.execute(sql`
        insert into moodboard_nodes (id, project_id, board_id, type, entity_id, width, height)
        values (${uuidIdGenerator.next()}, ${project.id}, ${board.id}, 'entity', ${foreign.id}, 100, 100)
      `),
      FOREIGN_KEY_VIOLATION,
    );
  });

  it('refuses a node claiming a reference its type has no room for', async () => {
    const asset = await image();

    await expectPostgresError(
      client.db.execute(sql`
        insert into moodboard_nodes (id, project_id, board_id, type, asset_id, width, height)
        values (${uuidIdGenerator.next()}, ${project.id}, ${board.id}, 'note', ${asset.id}, 100, 100)
      `),
      CHECK_VIOLATION,
    );
  });

  it('refuses a node with no visible size', async () => {
    await expectPostgresError(
      client.db.execute(sql`
        insert into moodboard_nodes (id, project_id, board_id, type, width, height)
        values (${uuidIdGenerator.next()}, ${project.id}, ${board.id}, 'note', 0, 100)
      `),
      CHECK_VIOLATION,
    );
  });
});

describe('deletion semantics', () => {
  it('removes the placement and leaves the asset alone', async () => {
    const asset = await image();
    const placed = await moodboards.addNode(project.id, board.id, {
      type: 'asset',
      assetId: asset.id,
    });

    await moodboards.removeNode(project.id, board.id, placed.id);

    expect((await moodboards.open(project.id, board.id)).nodes).toEqual([]);
    expect(await assets.getById(project.id, asset.id)).toEqual(asset);
  });

  it('ungroups the members of a deleted group rather than deleting them', async () => {
    const { group, note } = await grouped();

    await moodboards.removeNode(project.id, board.id, group.id);

    const remaining = (await moodboards.open(project.id, board.id)).nodes;
    expect(remaining.map((node) => node.id)).toEqual([note.id]);
    expect(remaining[0]?.groupId).toBeNull();
  });

  it('drops the connectors touching a deleted node', async () => {
    const { from, to } = await twoEntityNodes();
    await moodboards.connect(project.id, board.id, { fromNodeId: from.id, toNodeId: to.id });

    await moodboards.removeNode(project.id, board.id, to.id);

    expect((await moodboards.open(project.id, board.id)).connectors).toEqual([]);
  });

  it('clears the whole board when the project goes', async () => {
    await moodboards.addNode(project.id, board.id, { type: 'note' });
    const { from, to } = await twoEntityNodes();
    await moodboards.connect(project.id, board.id, { fromNodeId: from.id, toNodeId: to.id });

    await client.db.execute(sql`delete from projects where id = ${project.id}`);

    const nodes = await client.db.execute<{ total: number }>(
      sql`select count(*)::int as total from moodboard_nodes`,
    );
    const connectors = await client.db.execute<{ total: number }>(
      sql`select count(*)::int as total from moodboard_connectors`,
    );
    expect(Number(nodes.rows[0]?.total)).toBe(0);
    expect(Number(connectors.rows[0]?.total)).toBe(0);
  });
});

describe('promoting a connector', () => {
  it('writes a relationship and remembers it on the connector', async () => {
    const { tam, reef, from, to } = await twoEntityNodes();
    const connector = await moodboards.connect(project.id, board.id, {
      fromNodeId: from.id,
      toNodeId: to.id,
      label: 'grew up here',
    });

    const { relationship } = await moodboards.promoteConnector(
      project.id,
      board.id,
      connector.id,
      'appears_in',
    );

    const [stored] = (await moodboards.open(project.id, board.id)).connectors;
    expect(stored?.relationshipId).toBe(relationship.id);
    const neighbourhood = await relationships.neighborhood(project.id, tam.id, {});
    expect(neighbourhood.outgoing[0]?.entity.id).toBe(reef.id);
  });

  it('leaves the line in place when the relationship is unlinked', async () => {
    const { from, to } = await twoEntityNodes();
    const connector = await moodboards.connect(project.id, board.id, {
      fromNodeId: from.id,
      toNodeId: to.id,
    });
    const { relationship } = await moodboards.promoteConnector(
      project.id,
      board.id,
      connector.id,
      'references',
    );

    await relationships.unlink(project.id, relationship.id);

    const [stored] = (await moodboards.open(project.id, board.id)).connectors;
    expect(stored?.id).toBe(connector.id);
    expect(stored?.relationshipId).toBeNull();
  });

  it('rolls the new edge back when the connector cannot be updated', async () => {
    const { tam, reef, from, to } = await twoEntityNodes();
    const promoted = await moodboards.connect(project.id, board.id, {
      fromNodeId: from.id,
      toNodeId: to.id,
    });
    const other = await moodboards.connect(project.id, board.id, {
      fromNodeId: to.id,
      toNodeId: from.id,
    });
    const { relationship } = await moodboards.promoteConnector(
      project.id,
      board.id,
      promoted.id,
      'references',
    );

    // A second line claiming the edge the first already owns. Its own edge is
    // written first and the uniqueness constraint refuses the claim after, so
    // this only leaves the graph clean if the pair is one transaction.
    const doomed = await relationships.draftLink(project.id, {
      sourceEntityId: reef.id,
      targetEntityId: tam.id,
      relation: 'appears_in',
    });

    await expect(
      boardRepo.promoteConnector(
        { ...other, relationshipId: relationship.id, updatedAt: new Date() },
        doomed,
      ),
    ).rejects.toThrow(ConflictError);

    expect(await relationshipCount()).toBe(1);
    const lines = (await moodboards.open(project.id, board.id)).connectors;
    expect(lines.find((line) => line.id === other.id)?.relationshipId).toBeNull();
  });

  it('writes one edge when two promotions of the same line race', async () => {
    const { tam, from, to } = await twoEntityNodes();
    const connector = await moodboards.connect(project.id, board.id, {
      fromNodeId: from.id,
      toNodeId: to.id,
    });

    // Two different relations, so `entity_relationships`' unique edge is no
    // help: only the connector's own lock stops the second one being written.
    const outcomes = await Promise.allSettled([
      moodboards.promoteConnector(project.id, board.id, connector.id, 'references'),
      moodboards.promoteConnector(project.id, board.id, connector.id, 'appears_in'),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(await relationshipCount()).toBe(1);
    expect((await relationships.neighborhood(project.id, tam.id, {})).outgoing).toHaveLength(1);
  });
});

async function relationshipCount(): Promise<number> {
  const result = await client.db.execute<{ total: number }>(
    sql`select count(*)::int as total from entity_relationships`,
  );
  return Number(result.rows[0]?.total);
}

async function grouped(): Promise<{ group: MoodboardNode; note: MoodboardNode }> {
  const group = await moodboards.addNode(project.id, board.id, { type: 'group' });
  const note = await moodboards.addNode(project.id, board.id, { type: 'note' });
  await moodboards.updateNodes(project.id, board.id, [{ id: note.id, groupId: group.id }]);
  return { group, note };
}

async function twoEntityNodes(): Promise<{
  tam: Entity;
  reef: Entity;
  from: MoodboardNode;
  to: MoodboardNode;
}> {
  const tam = await entities.create(project.id, { type: 'character', name: 'Tam' });
  const reef = await entities.create(project.id, { type: 'location', name: 'The Reef' });
  return {
    tam,
    reef,
    from: await moodboards.addNode(project.id, board.id, { type: 'entity', entityId: tam.id }),
    to: await moodboards.addNode(project.id, board.id, { type: 'entity', entityId: reef.id }),
  };
}

const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

/** Asserts a raw statement was rejected by Postgres with a specific SQLSTATE. */
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
