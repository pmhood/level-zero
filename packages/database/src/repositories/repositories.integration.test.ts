import {
  ActivityService,
  assetReferenceData,
  EntityService,
  NotFoundError,
  ProjectService,
  createEntity,
  createProject,
  systemClock,
  uuidIdGenerator,
  type Entity,
  type Project,
} from '@level-zero/domain';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DatabaseClient } from '../postgres/client';
import { connectTestDatabase, truncateDomainTables } from '../testing/test-database';
import { DrizzleActivityRepository } from './activity-repository';
import { DrizzleEntityRepository } from './entity-repository';
import { DrizzleProjectRepository } from './project-repository';

const deps = { clock: systemClock, ids: uuidIdGenerator };

let client: DatabaseClient;
let projectRepo: DrizzleProjectRepository;
let entityRepo: DrizzleEntityRepository;
let projects: ProjectService;
let entities: EntityService;

beforeAll(async () => {
  client = await connectTestDatabase();
  projectRepo = new DrizzleProjectRepository(client.db);
  entityRepo = new DrizzleEntityRepository(client.db);
  projects = new ProjectService(projectRepo, deps);
  const activity = new ActivityService(new DrizzleActivityRepository(client.db), deps);
  entities = new EntityService(entityRepo, projectRepo, activity, deps);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await truncateDomainTables(client);
});

async function seedProject(name: string): Promise<Project> {
  return projectRepo.insert(createProject({ name }, deps));
}

async function seedEntity(project: Project, overrides: Partial<Entity> = {}): Promise<Entity> {
  const entity = createEntity({ projectId: project.id, type: 'character', name: 'Kael' }, deps);
  return entityRepo.insert({ ...entity, ...overrides });
}

describe('DrizzleProjectRepository', () => {
  it('round-trips a project', async () => {
    const created = await projects.create({ name: 'Deep Fathom', description: 'Sunken city' });
    const found = await projects.getById(created.id);

    expect(found).toEqual(created);
    expect(found.createdAt).toBeInstanceOf(Date);
  });

  it('lists with a total that ignores paging', async () => {
    await seedProject('One');
    await seedProject('Two');
    await seedProject('Three');

    const page = await projects.list({ limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(3);
  });

  it('persists an archive', async () => {
    const created = await projects.create({ name: 'Deep Fathom' });
    await projects.archive(created.id);

    const found = await projects.getById(created.id);
    expect(found.status).toBe('archived');
    expect(found.archivedAt).toBeInstanceOf(Date);
  });

  it('reports a missing project as not found', async () => {
    await expect(projects.getById('00000000-0000-4000-8000-000000000000')).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe('DrizzleEntityRepository round trips', () => {
  it('preserves structured data, tags and nulls exactly', async () => {
    const project = await seedProject('Deep Fathom');
    const created = await entities.create(project.id, {
      type: 'mechanic',
      name: 'Oxygen Management',
      tags: ['Core', 'Survival'],
      data: {
        loop: 'survival',
        tuning: { drainPerSecond: 0.4, curve: [0, 1, 2] },
        enabled: true,
        notes: null,
      },
    });

    const found = await entities.getById(project.id, created.id);

    expect(found.data).toEqual({
      loop: 'survival',
      tuning: { drainPerSecond: 0.4, curve: [0, 1, 2] },
      enabled: true,
      notes: null,
    });
    expect(found.tags).toEqual(['Core', 'Survival']);
    expect(found.description).toBeNull();
    expect(found.currentVersionId).toBeNull();
  });

  it('stores every entity type in the one table', async () => {
    const project = await seedProject('Deep Fathom');
    const types = ['idea', 'design_pillar', 'character', 'asset_reference', 'build'] as const;

    for (const type of types) {
      await entities.create(project.id, { type, name: `A ${type}` });
    }

    const page = await entities.listByProject(project.id);
    expect(page.total).toBe(types.length);
  });

  it('lets type-specific data change shape without a migration', async () => {
    const project = await seedProject('Deep Fathom');
    const character = await entities.create(project.id, {
      type: 'character',
      name: 'Kael',
      data: { age: 34 },
    });

    await entities.update(project.id, character.id, {
      data: { pronouns: 'they/them', homeworld: { name: 'Thess', gravity: 0.8 } },
    });

    const found = await entities.getById(project.id, character.id);
    expect(found.data).toEqual({
      pronouns: 'they/them',
      homeworld: { name: 'Thess', gravity: 0.8 },
    });
  });
});

describe('project scoping in SQL', () => {
  it('never reads an entity through the wrong project', async () => {
    const [a, b] = [await seedProject('A'), await seedProject('B')];
    const kael = await seedEntity(a);

    expect(await entityRepo.findById(b.id, kael.id)).toBeNull();
    expect(await entityRepo.findById(a.id, kael.id)).toMatchObject({ id: kael.id });
  });

  it('never updates an entity through the wrong project', async () => {
    const [a, b] = [await seedProject('A'), await seedProject('B')];
    const kael = await seedEntity(a);

    await expect(entityRepo.save({ ...kael, projectId: b.id, name: 'Hijacked' })).rejects.toThrow(
      NotFoundError,
    );
    expect(await entityRepo.findById(a.id, kael.id)).toMatchObject({ name: 'Kael' });
  });

  it('never lists another project entities', async () => {
    const [a, b] = [await seedProject('A'), await seedProject('B')];
    await seedEntity(a, { name: 'Kael' });
    await seedEntity(b, { name: 'Riven' });

    const page = await entities.listByProject(a.id);
    expect(page.items.map((entity) => entity.name)).toEqual(['Kael']);
  });
});

describe('filtering in SQL', () => {
  let project: Project;

  beforeEach(async () => {
    project = await seedProject('Deep Fathom');
    await entities.create(project.id, {
      type: 'character',
      name: 'Kael',
      description: 'A reluctant pilot',
      tags: ['Protagonist'],
    });
    await entities.create(project.id, { type: 'character', name: 'Riven', tags: ['Antagonist'] });
    await entities.create(project.id, {
      type: 'mechanic',
      name: 'Oxygen Management',
      status: 'active',
      tags: ['core'],
    });
  });

  it('filters by type', async () => {
    await expect(entities.listByType(project.id, 'character')).resolves.toMatchObject({ total: 2 });
    await expect(entities.listByType(project.id, 'mechanic')).resolves.toMatchObject({ total: 1 });
  });

  it('filters by status', async () => {
    const page = await entities.listByProject(project.id, { statuses: ['active'] });

    expect(page.items.map((entity) => entity.name)).toEqual(['Oxygen Management']);
  });

  it('matches tags regardless of the casing the user typed', async () => {
    await expect(
      entities.listByProject(project.id, { tags: ['PROTAGONIST'] }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(entities.listByProject(project.id, { tags: ['Core'] })).resolves.toMatchObject({
      total: 1,
    });
  });

  it('matches any of several tags', async () => {
    const page = await entities.listByProject(project.id, { tags: ['protagonist', 'antagonist'] });

    expect(page.total).toBe(2);
  });

  it('searches name and description case-insensitively', async () => {
    await expect(entities.listByProject(project.id, { search: 'OXYGEN' })).resolves.toMatchObject({
      total: 1,
    });
    await expect(
      entities.listByProject(project.id, { search: 'reluctant' }),
    ).resolves.toMatchObject({ total: 1 });
  });

  it('treats LIKE wildcards in a search term as literal text', async () => {
    await entities.create(project.id, { type: 'idea', name: 'Fuel is 100% of the tension' });

    await expect(entities.listByProject(project.id, { search: '100%' })).resolves.toMatchObject({
      total: 1,
    });
    // A bare wildcard must not match everything.
    await expect(entities.listByProject(project.id, { search: '%' })).resolves.toMatchObject({
      total: 1,
    });
  });

  it('hides archived entities unless asked for them', async () => {
    const kael = (await entities.listByType(project.id, 'character')).items.find(
      (entity) => entity.name === 'Kael',
    );
    await entities.archive(project.id, kael!.id);

    await expect(entities.listByProject(project.id)).resolves.toMatchObject({ total: 2 });
    await expect(
      entities.listByProject(project.id, { includeArchived: true }),
    ).resolves.toMatchObject({ total: 3 });
    await expect(
      entities.listByProject(project.id, { statuses: ['archived'] }),
    ).resolves.toMatchObject({ total: 1 });
  });

  it('pages while reporting the full total', async () => {
    const first = await entities.listByProject(project.id, { limit: 2, offset: 0 });
    const second = await entities.listByProject(project.id, { limit: 2, offset: 2 });

    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect(first.total).toBe(3);
    expect(new Set([...first.items, ...second.items].map((entity) => entity.id)).size).toBe(3);
  });
});

describe('DrizzleEntityRepository.findOrCreateAssetReference', () => {
  function candidate(project: Project, assetId: string, name = 'portrait.png'): Entity {
    return createEntity(
      {
        projectId: project.id,
        type: 'asset_reference',
        name,
        status: 'active',
        data: assetReferenceData(assetId),
      },
      deps,
    );
  }

  it('inserts the first reference for an asset', async () => {
    const project = await seedProject('Deep Fathom');

    const result = await entityRepo.findOrCreateAssetReference(
      candidate(project, 'asset-1'),
      'asset-1',
    );

    expect(result.created).toBe(true);
    expect(result.entity).toMatchObject({ type: 'asset_reference', data: { assetId: 'asset-1' } });
  });

  it('returns the existing reference instead of inserting a duplicate', async () => {
    const project = await seedProject('Deep Fathom');
    const first = await entityRepo.findOrCreateAssetReference(
      candidate(project, 'asset-1'),
      'asset-1',
    );

    const second = await entityRepo.findOrCreateAssetReference(
      candidate(project, 'asset-1'),
      'asset-1',
    );

    expect(second.created).toBe(false);
    expect(second.entity.id).toBe(first.entity.id);
  });

  it('never resolves a reference belonging to another project', async () => {
    const [a, b] = [await seedProject('A'), await seedProject('B')];
    const inA = await entityRepo.findOrCreateAssetReference(
      candidate(a, 'shared-asset'),
      'shared-asset',
    );

    const inB = await entityRepo.findOrCreateAssetReference(
      candidate(b, 'shared-asset'),
      'shared-asset',
    );

    expect(inB.created).toBe(true);
    expect(inB.entity.id).not.toBe(inA.entity.id);
    expect(inB.entity.projectId).toBe(b.id);
  });

  it('finds an archived reference rather than creating a second one', async () => {
    const project = await seedProject('Deep Fathom');
    const first = await entityRepo.findOrCreateAssetReference(
      candidate(project, 'asset-1'),
      'asset-1',
    );
    await entities.archive(project.id, first.entity.id);

    const second = await entityRepo.findOrCreateAssetReference(
      candidate(project, 'asset-1'),
      'asset-1',
    );

    expect(second.created).toBe(false);
    expect(second.entity.id).toBe(first.entity.id);
  });

  it('lets two callers race to attach the same asset and produces one reference', async () => {
    const project = await seedProject('Deep Fathom');

    const [first, second] = await Promise.all([
      entityRepo.findOrCreateAssetReference(candidate(project, 'asset-1'), 'asset-1'),
      entityRepo.findOrCreateAssetReference(candidate(project, 'asset-1'), 'asset-1'),
    ]);

    expect(first.entity.id).toBe(second.entity.id);
    expect([first.created, second.created].sort()).toEqual([false, true]);

    const page = await entities.listByProject(project.id, {
      types: ['asset_reference'],
      includeArchived: true,
    });
    expect(page.items.filter((item) => item.data.assetId === 'asset-1')).toHaveLength(1);
  });
});

describe('referential integrity', () => {
  it('removes a project entities when the project row is deleted', async () => {
    const project = await seedProject('Deep Fathom');
    await seedEntity(project);

    // Deleting a project is not a product feature; this proves the cascade
    // exists so no orphan entities can be left behind.
    await client.db.execute(sql`delete from projects where id = ${project.id}`);

    await expect(entities.listByProject(project.id)).resolves.toMatchObject({ total: 0 });
  });
});
