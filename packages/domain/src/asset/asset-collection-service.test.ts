import { beforeEach, describe, expect, it } from 'vitest';

import { ActivityService } from '../activity/activity-service';
import { type Asset } from './asset';
import { AssetService } from './asset-service';
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
  InMemoryObjectStorageProvider,
  InMemoryProjectRepository,
} from '../testing';
import { AssetCollectionService } from './asset-collection-service';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let entities: EntityService;
let entityRepo: InMemoryEntityRepository;
let assets: AssetService;
let assetRepo: InMemoryAssetRepository;
let relationships: EntityRelationshipService;
let relationshipRepo: InMemoryEntityRelationshipRepository;
let collections: AssetCollectionService;
let project: Project;
let otherProject: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  const projectRepo = new InMemoryProjectRepository();
  entityRepo = new InMemoryEntityRepository();
  assetRepo = new InMemoryAssetRepository();
  relationshipRepo = new InMemoryEntityRelationshipRepository();
  const activity = new ActivityService(new InMemoryActivityRepository(), deps);

  entities = new EntityService(entityRepo, projectRepo, activity, deps);
  assets = new AssetService(assetRepo, projectRepo, new InMemoryObjectStorageProvider(), deps);
  relationships = new EntityRelationshipService(relationshipRepo, entityRepo, deps);
  collections = new AssetCollectionService(entities, relationships, assetRepo);

  project = await projectRepo.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project-a') }),
  );
  otherProject = await projectRepo.insert(
    createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
  );
});

function image(name = 'reef.png', projectId = project.id): Promise<Asset> {
  return assets.upload(projectId, {
    kind: 'image',
    filename: name,
    mimeType: 'image/png',
    content: Buffer.from(name),
  });
}

function collection(name = 'Props & Gear', projectId = project.id): Promise<Entity> {
  return collections.create(projectId, { name });
}

describe('creating a collection', () => {
  it('is an asset_collection entity, named and tagged like any other', async () => {
    const created = await collections.create(project.id, {
      name: 'UI & HUD',
      description: 'Interface art',
      tags: ['ui'],
    });

    expect(created).toMatchObject({
      type: 'asset_collection',
      name: 'UI & HUD',
      description: 'Interface art',
      tags: ['ui'],
      projectId: project.id,
    });
  });
});

describe('renaming a collection', () => {
  it('changes the name and nothing else', async () => {
    const board = await collection();

    const renamed = await collections.rename(project.id, board.id, 'Environment Props');

    expect(renamed.name).toBe('Environment Props');
    expect(renamed.id).toBe(board.id);
  });

  it('rejects an id that is not a collection', async () => {
    const character = await entities.create(project.id, { type: 'character', name: 'Kael' });

    await expect(collections.rename(project.id, character.id, 'x')).rejects.toThrow(
      ValidationError,
    );
  });

  it('rejects an id from another project', async () => {
    const board = await collection();

    await expect(collections.rename(otherProject.id, board.id, 'x')).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe('archiving a collection', () => {
  it('archives the collection but leaves every member asset untouched', async () => {
    const board = await collection();
    const asset = await image();
    await collections.addAsset(project.id, board.id, asset.id);

    const archived = await collections.archive(project.id, board.id);

    expect(archived.status).toBe('archived');
    const untouched = await assets.getById(project.id, asset.id);
    expect(untouched.status).toBe('active');
  });
});

describe('adding an asset to a collection', () => {
  it('creates a contains edge from the collection to the asset reference', async () => {
    const board = await collection();
    const asset = await image('portrait.png');

    const edge = await collections.addAsset(project.id, board.id, asset.id);

    expect(edge).toMatchObject({
      sourceEntityId: board.id,
      relation: 'contains',
    });

    const reference = await entities.findAssetReference(project.id, asset.id);
    expect(reference?.id).toBe(edge.targetEntityId);
    expect(reference?.type).toBe('asset_reference');
  });

  it('reuses one reference entity for the same asset in two collections', async () => {
    const propsCollection = await collection('Props & Gear');
    const uiCollection = await collection('UI & HUD');
    const asset = await image('icon.png');

    const first = await collections.addAsset(project.id, propsCollection.id, asset.id);
    const second = await collections.addAsset(project.id, uiCollection.id, asset.id);

    expect(second.targetEntityId).toBe(first.targetEntityId);

    const references = await entities.listByProject(project.id, { types: ['asset_reference'] });
    expect(references.total).toBe(1);
  });

  it('refuses to add the same asset to the same collection twice', async () => {
    const board = await collection();
    const asset = await image();
    await collections.addAsset(project.id, board.id, asset.id);

    await expect(collections.addAsset(project.id, board.id, asset.id)).rejects.toThrow(
      ConflictError,
    );
  });

  it('rejects a missing asset', async () => {
    const board = await collection();

    await expect(collections.addAsset(project.id, board.id, 'missing-asset')).rejects.toThrow(
      NotFoundError,
    );
  });

  it('rejects an id that is not a collection', async () => {
    const character = await entities.create(project.id, { type: 'character', name: 'Kael' });
    const asset = await image();

    await expect(collections.addAsset(project.id, character.id, asset.id)).rejects.toThrow(
      ValidationError,
    );
  });

  it('never lets an asset from another project into the collection', async () => {
    const board = await collection();
    const assetInOtherProject = await image('reef.png', otherProject.id);

    await expect(
      collections.addAsset(project.id, board.id, assetInOtherProject.id),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('removing an asset from a collection', () => {
  it('deletes the membership only, leaving the asset and its reference intact', async () => {
    const board = await collection();
    const asset = await image();
    const edge = await collections.addAsset(project.id, board.id, asset.id);

    await collections.removeAsset(project.id, board.id, asset.id);

    await expect(relationships.getById(project.id, edge.id)).rejects.toThrow(NotFoundError);
    const untouched = await assets.getById(project.id, asset.id);
    expect(untouched.status).toBe('active');
    const reference = await entities.findAssetReference(project.id, asset.id);
    expect(reference).not.toBeNull();
  });

  it('leaves the asset in every collection it was not removed from', async () => {
    const propsCollection = await collection('Props & Gear');
    const uiCollection = await collection('UI & HUD');
    const asset = await image('icon.png');
    await collections.addAsset(project.id, propsCollection.id, asset.id);
    const inUi = await collections.addAsset(project.id, uiCollection.id, asset.id);

    await collections.removeAsset(project.id, propsCollection.id, asset.id);

    const stillThere = await relationships.getById(project.id, inUi.id);
    expect(stillThere.id).toBe(inUi.id);
  });

  it('is a no-op, not an error, when the asset was never in the collection', async () => {
    const board = await collection();
    const asset = await image();

    await expect(collections.removeAsset(project.id, board.id, asset.id)).resolves.toBeUndefined();

    // No reference was materialized as a side effect of looking for one to remove.
    expect(await entities.findAssetReference(project.id, asset.id)).toBeNull();
  });
});
