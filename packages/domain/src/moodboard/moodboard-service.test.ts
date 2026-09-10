import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityService } from '../activity/activity-service';
import { type Asset } from '../asset/asset';
import { AssetService } from '../asset/asset-service';
import { type Entity } from '../entity/entity';
import { EntityService } from '../entity/entity-service';
import { createProject, type Project } from '../project/project';
import { EntityRelationshipService } from '../relationship/entity-relationship-service';
import { fixedClock } from '../shared/clock';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  InMemoryActivityRepository,
  InMemoryAssetRepository,
  InMemoryEntityRelationshipRepository,
  InMemoryEntityRepository,
  InMemoryMoodboardRepository,
  InMemoryObjectStorageProvider,
  InMemoryProjectRepository,
} from '../testing';
import { MoodboardService } from './moodboard-service';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let entities: EntityService;
let entityRepo: InMemoryEntityRepository;
let assets: AssetService;
let assetRepo: InMemoryAssetRepository;
let relationships: EntityRelationshipService;
let boardRepo: InMemoryMoodboardRepository;
let moodboards: MoodboardService;
let project: Project;
let otherProject: Project;
let board: Entity;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projectRepo = new InMemoryProjectRepository();
  entityRepo = new InMemoryEntityRepository();
  assetRepo = new InMemoryAssetRepository();
  const relationshipRepo = new InMemoryEntityRelationshipRepository();
  const activity = new ActivityService(new InMemoryActivityRepository(), deps);

  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  assets = new AssetService(assetRepo, projectRepo, new InMemoryObjectStorageProvider(), deps);
  relationships = new EntityRelationshipService(relationshipRepo, entityRepo, deps);
  boardRepo = new InMemoryMoodboardRepository(relationshipRepo);
  moodboards = new MoodboardService(boardRepo, entities, assetRepo, relationships, deps);

  project = await projectRepo.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project-a') }),
  );
  otherProject = await projectRepo.insert(
    createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
  );
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

describe('opening a board', () => {
  it('returns the board with everything on it', async () => {
    const asset = await image();
    await moodboards.addNode(project.id, board.id, { type: 'asset', assetId: asset.id, x: 40 });
    await moodboards.addNode(project.id, board.id, { type: 'note', data: { text: 'colder' } });

    const opened = await moodboards.open(project.id, board.id);

    expect(opened.board.id).toBe(board.id);
    expect(opened.nodes).toHaveLength(2);
    expect(opened.connectors).toEqual([]);
  });

  it('opens a board with nothing on it', async () => {
    const opened = await moodboards.open(project.id, board.id);

    expect(opened.nodes).toEqual([]);
    expect(opened.connectors).toEqual([]);
  });

  it('cannot be opened from another project', async () => {
    await expect(moodboards.open(otherProject.id, board.id)).rejects.toThrow(NotFoundError);
  });

  it('refuses an entity that is not a moodboard', async () => {
    const character = await entities.create(project.id, { type: 'character', name: 'Tam' });

    await expect(moodboards.open(project.id, character.id)).rejects.toThrow(ValidationError);
  });
});

describe('placing things on a board', () => {
  it('persists the layout it was given', async () => {
    const asset = await image();

    const placed = await moodboards.addNode(project.id, board.id, {
      type: 'asset',
      assetId: asset.id,
      x: 120,
      y: -40,
      width: 320,
      height: 200,
      rotation: 0.35,
      zOrder: 2,
    });

    const [reopened] = (await moodboards.open(project.id, board.id)).nodes;
    expect(reopened).toEqual(placed);
    expect(reopened).toMatchObject({
      x: 120,
      y: -40,
      width: 320,
      height: 200,
      rotation: 0.35,
      zOrder: 2,
    });
  });

  it('refuses an asset from another project', async () => {
    const foreign = await image('other.png', otherProject.id);

    await expect(
      moodboards.addNode(project.id, board.id, { type: 'asset', assetId: foreign.id }),
    ).rejects.toThrow(NotFoundError);
  });

  it('refuses an entity from another project', async () => {
    const foreign = await entities.create(otherProject.id, { type: 'location', name: 'Elsewhere' });

    await expect(
      moodboards.addNode(project.id, board.id, { type: 'entity', entityId: foreign.id }),
    ).rejects.toThrow(NotFoundError);
  });

  it('refuses to edit an archived board', async () => {
    await entities.archive(project.id, board.id);

    await expect(moodboards.addNode(project.id, board.id, { type: 'note' })).rejects.toThrow(
      ConflictError,
    );
  });
});

describe('reference integrity', () => {
  it('puts one asset on two boards without copying it', async () => {
    const asset = await image();
    const second = await entities.create(project.id, { type: 'moodboard', name: 'Palette study' });

    const here = await moodboards.addNode(project.id, board.id, {
      type: 'asset',
      assetId: asset.id,
      x: 0,
    });
    const there = await moodboards.addNode(project.id, second.id, {
      type: 'asset',
      assetId: asset.id,
      x: 900,
    });

    expect(here.assetId).toBe(asset.id);
    expect(there.assetId).toBe(asset.id);
    expect(here.id).not.toBe(there.id);
    expect(here.x).not.toBe(there.x);
    expect((await assets.listByProject(project.id, {})).total).toBe(1);
  });

  it('keeps layout off the asset, so moving a node changes nothing else', async () => {
    const asset = await image();
    const placed = await moodboards.addNode(project.id, board.id, {
      type: 'asset',
      assetId: asset.id,
    });

    await moodboards.updateNodes(project.id, board.id, [{ id: placed.id, x: 500, y: 500 }]);

    expect(await assets.getById(project.id, asset.id)).toEqual(asset);
  });

  it('leaves the asset in the library when its node is removed', async () => {
    const asset = await image();
    const placed = await moodboards.addNode(project.id, board.id, {
      type: 'asset',
      assetId: asset.id,
    });

    await moodboards.removeNode(project.id, board.id, placed.id);

    expect((await moodboards.open(project.id, board.id)).nodes).toEqual([]);
    expect(await assets.getById(project.id, asset.id)).toEqual(asset);
  });

  it('leaves the entity untouched when its node is removed', async () => {
    const character = await entities.create(project.id, { type: 'character', name: 'Tam' });
    const placed = await moodboards.addNode(project.id, board.id, {
      type: 'entity',
      entityId: character.id,
    });

    await moodboards.removeNode(project.id, board.id, placed.id);

    const still = await entities.getById(project.id, character.id);
    expect(still).toEqual(character);
    expect(still.status).not.toBe('archived');
  });

  it('leaves the other board alone when a node is removed from one', async () => {
    const asset = await image();
    const second = await entities.create(project.id, { type: 'moodboard', name: 'Palette study' });
    const here = await moodboards.addNode(project.id, board.id, {
      type: 'asset',
      assetId: asset.id,
    });
    await moodboards.addNode(project.id, second.id, { type: 'asset', assetId: asset.id });

    await moodboards.removeNode(project.id, board.id, here.id);

    expect((await moodboards.open(project.id, second.id)).nodes).toHaveLength(1);
  });
});

describe('transforming nodes', () => {
  it('reads a whole selection in one batched query, not one per patch', async () => {
    const nodes = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        moodboards.addNode(project.id, board.id, { type: 'note', x: index, y: index }),
      ),
    );
    const findNode = vi.spyOn(boardRepo, 'findNode');
    const findNodes = vi.spyOn(boardRepo, 'findNodes');

    await moodboards.updateNodes(
      project.id,
      board.id,
      nodes.map((node) => ({ id: node.id, x: node.x + 1 })),
    );

    expect(findNodes).toHaveBeenCalledTimes(1);
    expect(findNode).not.toHaveBeenCalled();
  });

  it('reads any newly referenced groups in one more batched query, still not one per patch', async () => {
    const group = await moodboards.addNode(project.id, board.id, { type: 'group' });
    const notes = await Promise.all(
      Array.from({ length: 4 }, () => moodboards.addNode(project.id, board.id, { type: 'note' })),
    );
    const findNode = vi.spyOn(boardRepo, 'findNode');
    const findNodes = vi.spyOn(boardRepo, 'findNodes');

    await moodboards.updateNodes(
      project.id,
      board.id,
      notes.map((note) => ({ id: note.id, groupId: group.id })),
    );

    expect(findNodes).toHaveBeenCalledTimes(2);
    expect(findNode).not.toHaveBeenCalled();
  });

  it('moves a whole selection in one request', async () => {
    const first = await moodboards.addNode(project.id, board.id, { type: 'note', x: 0, y: 0 });
    const second = await moodboards.addNode(project.id, board.id, { type: 'text', x: 10, y: 10 });

    const moved = await moodboards.updateNodes(project.id, board.id, [
      { id: first.id, x: 100, y: 100 },
      { id: second.id, x: 110, y: 110, rotation: 0.5 },
    ]);

    expect(moved.map((node) => [node.x, node.y])).toEqual([
      [100, 100],
      [110, 110],
    ]);
    const reopened = (await moodboards.open(project.id, board.id)).nodes;
    expect(reopened.find((node) => node.id === second.id)?.rotation).toBe(0.5);
  });

  it('refuses to move a locked node until it is unlocked', async () => {
    const placed = await moodboards.addNode(project.id, board.id, { type: 'note', locked: true });

    await expect(
      moodboards.updateNodes(project.id, board.id, [{ id: placed.id, x: 50 }]),
    ).rejects.toThrow(ConflictError);

    await moodboards.updateNodes(project.id, board.id, [{ id: placed.id, locked: false }]);
    const [moved] = await moodboards.updateNodes(project.id, board.id, [{ id: placed.id, x: 50 }]);
    expect(moved?.x).toBe(50);
  });

  it('still reorders a locked node, because locking is about not nudging it', async () => {
    const placed = await moodboards.addNode(project.id, board.id, { type: 'note', locked: true });

    const [reordered] = await moodboards.updateNodes(project.id, board.id, [
      { id: placed.id, zOrder: 3, locked: true },
    ]);

    expect(reordered?.zOrder).toBe(3);
    expect(reordered?.locked).toBe(true);
  });

  it('rejects a node from another board', async () => {
    const second = await entities.create(project.id, { type: 'moodboard', name: 'Palette study' });
    const elsewhere = await moodboards.addNode(project.id, second.id, { type: 'note' });

    await expect(
      moodboards.updateNodes(project.id, board.id, [{ id: elsewhere.id, x: 1 }]),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('grouping', () => {
  it('groups and ungroups nodes', async () => {
    const group = await moodboards.addNode(project.id, board.id, { type: 'group' });
    const note = await moodboards.addNode(project.id, board.id, { type: 'note' });

    const [grouped] = await moodboards.updateNodes(project.id, board.id, [
      { id: note.id, groupId: group.id },
    ]);
    expect(grouped?.groupId).toBe(group.id);

    const [ungrouped] = await moodboards.updateNodes(project.id, board.id, [
      { id: note.id, groupId: null },
    ]);
    expect(ungrouped?.groupId).toBeNull();
  });

  it('ungroups the members when the group itself is removed', async () => {
    const group = await moodboards.addNode(project.id, board.id, { type: 'group' });
    const note = await moodboards.addNode(project.id, board.id, { type: 'note' });
    await moodboards.updateNodes(project.id, board.id, [{ id: note.id, groupId: group.id }]);

    await moodboards.removeNode(project.id, board.id, group.id);

    const remaining = (await moodboards.open(project.id, board.id)).nodes;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.groupId).toBeNull();
  });

  it('refuses a group inside a group, and a group under a plain node', async () => {
    const group = await moodboards.addNode(project.id, board.id, { type: 'group' });
    const note = await moodboards.addNode(project.id, board.id, { type: 'note' });
    const inner = await moodboards.addNode(project.id, board.id, { type: 'group' });

    await expect(
      moodboards.updateNodes(project.id, board.id, [{ id: inner.id, groupId: group.id }]),
    ).rejects.toThrow(ValidationError);
    await expect(
      moodboards.updateNodes(project.id, board.id, [{ id: note.id, groupId: inner.id }]),
    ).resolves.toBeDefined();
    await expect(
      moodboards.updateNodes(project.id, board.id, [{ id: note.id, groupId: 'missing' }]),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('duplicating', () => {
  it('copies the placement and shares the asset', async () => {
    const asset = await image();
    const original = await moodboards.addNode(project.id, board.id, {
      type: 'asset',
      assetId: asset.id,
      x: 100,
      y: 100,
      width: 300,
      height: 200,
    });

    const [copy] = await moodboards.duplicateNodes(project.id, board.id, [original.id]);

    expect(copy?.id).not.toBe(original.id);
    expect(copy?.assetId).toBe(asset.id);
    expect(copy).toMatchObject({ x: 124, y: 124, width: 300, height: 200 });
    expect((await assets.listByProject(project.id, {})).total).toBe(1);
  });

  it('remaps a duplicated group onto its duplicated members', async () => {
    const group = await moodboards.addNode(project.id, board.id, { type: 'group' });
    const note = await moodboards.addNode(project.id, board.id, { type: 'note' });
    await moodboards.updateNodes(project.id, board.id, [{ id: note.id, groupId: group.id }]);

    const copies = await moodboards.duplicateNodes(project.id, board.id, [group.id, note.id]);

    const groupCopy = copies.find((node) => node.type === 'group');
    const noteCopy = copies.find((node) => node.type === 'note');
    expect(noteCopy?.groupId).toBe(groupCopy?.id);
    expect(noteCopy?.groupId).not.toBe(group.id);
  });

  it('drops a group membership whose group was not copied', async () => {
    const group = await moodboards.addNode(project.id, board.id, { type: 'group' });
    const note = await moodboards.addNode(project.id, board.id, { type: 'note' });
    await moodboards.updateNodes(project.id, board.id, [{ id: note.id, groupId: group.id }]);

    const [copy] = await moodboards.duplicateNodes(project.id, board.id, [note.id]);

    expect(copy?.groupId).toBeNull();
  });
});

describe('connectors', () => {
  async function twoCharacters() {
    const tam = await entities.create(project.id, { type: 'character', name: 'Tam' });
    const reef = await entities.create(project.id, { type: 'location', name: 'The Reef' });
    const from = await moodboards.addNode(project.id, board.id, {
      type: 'entity',
      entityId: tam.id,
    });
    const to = await moodboards.addNode(project.id, board.id, {
      type: 'entity',
      entityId: reef.id,
    });
    return { tam, reef, from, to };
  }

  it('draws a line without touching the project graph', async () => {
    const { tam, from, to } = await twoCharacters();

    const connector = await moodboards.connect(project.id, board.id, {
      fromNodeId: from.id,
      toNodeId: to.id,
      label: 'grew up here',
    });

    expect(connector.relationshipId).toBeNull();
    const neighbourhood = await relationships.neighborhood(project.id, tam.id, {});
    expect(neighbourhood.outgoing).toEqual([]);
    expect(neighbourhood.incoming).toEqual([]);
  });

  it('refuses to join a node to itself or to a node on another board', async () => {
    const { from } = await twoCharacters();
    const second = await entities.create(project.id, { type: 'moodboard', name: 'Palette study' });
    const elsewhere = await moodboards.addNode(project.id, second.id, { type: 'note' });

    await expect(
      moodboards.connect(project.id, board.id, { fromNodeId: from.id, toNodeId: from.id }),
    ).rejects.toThrow(ValidationError);
    await expect(
      moodboards.connect(project.id, board.id, { fromNodeId: from.id, toNodeId: elsewhere.id }),
    ).rejects.toThrow(NotFoundError);
  });

  it('becomes a relationship only when it is explicitly promoted', async () => {
    const { tam, reef, from, to } = await twoCharacters();
    const connector = await moodboards.connect(project.id, board.id, {
      fromNodeId: from.id,
      toNodeId: to.id,
    });

    const promotion = await moodboards.promoteConnector(
      project.id,
      board.id,
      connector.id,
      'appears_in',
    );

    expect(promotion.relationship).toMatchObject({
      sourceEntityId: tam.id,
      targetEntityId: reef.id,
      relation: 'appears_in',
    });
    expect(promotion.connector.relationshipId).toBe(promotion.relationship.id);
    const neighbourhood = await relationships.neighborhood(project.id, tam.id, {});
    expect(neighbourhood.outgoing).toHaveLength(1);
  });

  it('records where a promoted relationship came from', async () => {
    const { from, to } = await twoCharacters();
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

    expect(relationship.metadata).toEqual({ boardId: board.id, connectorId: connector.id });
  });

  it('refuses to promote a line that does not join two entities', async () => {
    const asset = await image();
    const { from } = await twoCharacters();
    const imageNode = await moodboards.addNode(project.id, board.id, {
      type: 'asset',
      assetId: asset.id,
    });
    const connector = await moodboards.connect(project.id, board.id, {
      fromNodeId: from.id,
      toNodeId: imageNode.id,
    });

    await expect(
      moodboards.promoteConnector(project.id, board.id, connector.id, 'references'),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses to promote the same line twice', async () => {
    const { from, to } = await twoCharacters();
    const connector = await moodboards.connect(project.id, board.id, {
      fromNodeId: from.id,
      toNodeId: to.id,
    });
    await moodboards.promoteConnector(project.id, board.id, connector.id, 'references');

    await expect(
      moodboards.promoteConnector(project.id, board.id, connector.id, 'references'),
    ).rejects.toThrow(ConflictError);
  });

  it('erases the line without unlinking what it was promoted into', async () => {
    const { tam, from, to } = await twoCharacters();
    const connector = await moodboards.connect(project.id, board.id, {
      fromNodeId: from.id,
      toNodeId: to.id,
    });
    await moodboards.promoteConnector(project.id, board.id, connector.id, 'references');

    await moodboards.disconnect(project.id, board.id, connector.id);

    expect((await moodboards.open(project.id, board.id)).connectors).toEqual([]);
    expect((await relationships.neighborhood(project.id, tam.id, {})).outgoing).toHaveLength(1);
  });

  it('drops the lines touching a node that is removed', async () => {
    const { from, to } = await twoCharacters();
    await moodboards.connect(project.id, board.id, { fromNodeId: from.id, toNodeId: to.id });

    await moodboards.removeNode(project.id, board.id, from.id);

    expect((await moodboards.open(project.id, board.id)).connectors).toEqual([]);
  });

  it('retitles a line', async () => {
    const { from, to } = await twoCharacters();
    const connector = await moodboards.connect(project.id, board.id, {
      fromNodeId: from.id,
      toNodeId: to.id,
      label: 'maybe',
    });

    const renamed = await moodboards.annotateConnector(
      project.id,
      board.id,
      connector.id,
      'definitely',
    );

    expect(renamed.label).toBe('definitely');
  });
});
