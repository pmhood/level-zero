import { beforeEach, describe, expect, it } from 'vitest';

import { ActivityService } from '../activity/activity-service';
import { createProject, type Project } from '../project/project';
import { ProjectService } from '../project/project-service';
import { fixedClock } from '../shared/clock';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  InMemoryActivityRepository,
  InMemoryEntityRepository,
  InMemoryProjectRepository,
} from '../testing';
import { EntityService } from './entity-service';

const clock = fixedClock('2026-03-01T09:00:00.000Z');

let projects: InMemoryProjectRepository;
let entities: InMemoryEntityRepository;
let entityService: EntityService;
let projectService: ProjectService;
let activityRepo: InMemoryActivityRepository;
let projectA: Project;
let projectB: Project;

beforeEach(async () => {
  const deps = { clock, ids: sequentialIdGenerator('id') };
  projects = new InMemoryProjectRepository();
  entities = new InMemoryEntityRepository();
  projectService = new ProjectService(projects, deps);
  activityRepo = new InMemoryActivityRepository();
  const activity = new ActivityService(activityRepo, deps);
  entityService = new EntityService(entities, projects, activity, deps);

  projectA = await projects.insert(
    createProject({ name: 'Deep Fathom' }, { clock, ids: sequentialIdGenerator('project-a') }),
  );
  projectB = await projects.insert(
    createProject({ name: 'Sky Wreck' }, { clock, ids: sequentialIdGenerator('project-b') }),
  );
});

describe('creating entities', () => {
  it('creates entities of several types under one project', async () => {
    await entityService.create(projectA.id, { type: 'idea', name: 'Oxygen is currency' });
    await entityService.create(projectA.id, { type: 'character', name: 'Kael' });
    await entityService.create(projectA.id, { type: 'mechanic', name: 'Oxygen Management' });

    const page = await entityService.listByProject(projectA.id);

    expect(page.total).toBe(3);
    expect(page.items.map((entity) => entity.type).sort()).toEqual([
      'character',
      'idea',
      'mechanic',
    ]);
  });

  it('rejects creating an entity in a project that does not exist', async () => {
    await expect(
      entityService.create('missing-project', { type: 'idea', name: 'x' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects creating an entity in an archived project', async () => {
    await projectService.archive(projectB.id);

    await expect(entityService.create(projectB.id, { type: 'idea', name: 'x' })).rejects.toThrow(
      ConflictError,
    );
  });

  it('surfaces validation failures from the domain model', async () => {
    await expect(entityService.create(projectA.id, { type: 'idea', name: ' ' })).rejects.toThrow(
      ValidationError,
    );
  });
});

describe('the activity feed', () => {
  it('records entity_created, entity_archived and entity_restored', async () => {
    const kael = await entityService.create(projectA.id, { type: 'character', name: 'Kael' });
    await entityService.archive(projectA.id, kael.id);
    await entityService.restore(projectA.id, kael.id);

    const feed = await activityRepo.listByProject(projectA.id, {});

    expect(feed.items.map((item) => item.type)).toEqual([
      'entity_restored',
      'entity_archived',
      'entity_created',
    ]);
    expect(feed.items[2]).toMatchObject({
      summary: 'Kael created',
      subjectType: 'entity',
      subjectId: kael.id,
    });
    expect(feed.items[1]).toMatchObject({ summary: 'Kael archived', subjectId: kael.id });
    expect(feed.items[0]).toMatchObject({ summary: 'Kael restored', subjectId: kael.id });
  });
});

describe('project scoping', () => {
  it('never returns another project entities', async () => {
    await entityService.create(projectA.id, { type: 'character', name: 'Kael' });
    await entityService.create(projectB.id, { type: 'character', name: 'Riven' });

    const page = await entityService.listByProject(projectA.id);

    expect(page.items.map((entity) => entity.name)).toEqual(['Kael']);
  });

  it('reports an entity read through the wrong project as not found', async () => {
    const kael = await entityService.create(projectA.id, { type: 'character', name: 'Kael' });

    await expect(entityService.getById(projectB.id, kael.id)).rejects.toThrow(NotFoundError);
    await expect(entityService.getById(projectA.id, kael.id)).resolves.toMatchObject({
      name: 'Kael',
    });
  });

  it('refuses to update an entity through the wrong project', async () => {
    const kael = await entityService.create(projectA.id, { type: 'character', name: 'Kael' });

    await expect(entityService.update(projectB.id, kael.id, { name: 'Hijacked' })).rejects.toThrow(
      NotFoundError,
    );
    await expect(entityService.getById(projectA.id, kael.id)).resolves.toMatchObject({
      name: 'Kael',
    });
  });

  it('refuses to archive an entity through the wrong project', async () => {
    const kael = await entityService.create(projectA.id, { type: 'character', name: 'Kael' });

    await expect(entityService.archive(projectB.id, kael.id)).rejects.toThrow(NotFoundError);
  });
});

describe('the same entity read from different feature modules', () => {
  it('is one record, not a per-feature copy', async () => {
    const created = await entityService.create(projectA.id, {
      type: 'mechanic',
      name: 'Oxygen Management',
      data: { loop: 'survival' },
    });

    // A "Mechanics" view lists by type; a "GDD" view reads the same id.
    const listed = (await entityService.listByType(projectA.id, 'mechanic')).items[0];
    const fetched = await entityService.getById(projectA.id, created.id);

    expect(listed?.id).toBe(created.id);
    expect(fetched).toEqual(listed);

    await entityService.update(projectA.id, created.id, { name: 'Oxygen Budget' });

    expect((await entityService.getById(projectA.id, created.id)).name).toBe('Oxygen Budget');
    expect((await entityService.listByType(projectA.id, 'mechanic')).items[0]?.name).toBe(
      'Oxygen Budget',
    );
  });
});

describe('filtering', () => {
  beforeEach(async () => {
    await entityService.create(projectA.id, {
      type: 'character',
      name: 'Kael',
      tags: ['Protagonist'],
      description: 'A reluctant pilot',
    });
    await entityService.create(projectA.id, {
      type: 'character',
      name: 'Riven',
      tags: ['Antagonist'],
    });
    await entityService.create(projectA.id, {
      type: 'mechanic',
      name: 'Oxygen Management',
      status: 'active',
      tags: ['core'],
    });
  });

  it('filters by type', async () => {
    const page = await entityService.listByType(projectA.id, 'character');

    expect(page.total).toBe(2);
    expect(page.items.every((entity) => entity.type === 'character')).toBe(true);
  });

  it('filters by status', async () => {
    const page = await entityService.listByProject(projectA.id, { statuses: ['active'] });

    expect(page.items.map((entity) => entity.name)).toEqual(['Oxygen Management']);
  });

  it('filters by tag, ignoring case', async () => {
    const page = await entityService.listByProject(projectA.id, { tags: ['protagonist'] });

    expect(page.items.map((entity) => entity.name)).toEqual(['Kael']);
  });

  it('searches name and description', async () => {
    await expect(
      entityService.listByProject(projectA.id, { search: 'oxygen' }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(
      entityService.listByProject(projectA.id, { search: 'reluctant' }),
    ).resolves.toMatchObject({ total: 1 });
  });

  it('hides archived entities by default and shows them on request', async () => {
    const kael = (await entityService.listByType(projectA.id, 'character')).items.find(
      (entity) => entity.name === 'Kael',
    );
    await entityService.archive(projectA.id, kael!.id);

    await expect(entityService.listByProject(projectA.id)).resolves.toMatchObject({ total: 2 });
    await expect(
      entityService.listByProject(projectA.id, { includeArchived: true }),
    ).resolves.toMatchObject({ total: 3 });
  });

  it('pages without losing the total', async () => {
    const page = await entityService.listByProject(projectA.id, { limit: 2, offset: 0 });

    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(3);
  });

  it('rejects an out-of-range page size', async () => {
    await expect(entityService.listByProject(projectA.id, { limit: 500 })).rejects.toThrow(
      ValidationError,
    );
  });
});

describe('finding or creating an asset reference', () => {
  it('creates one asset_reference entity the first time an asset is attached', async () => {
    const reference = await entityService.findOrCreateAssetReference(projectA.id, 'asset-1', {
      name: 'portrait.png',
    });

    expect(reference).toMatchObject({
      type: 'asset_reference',
      name: 'portrait.png',
      data: { assetId: 'asset-1' },
    });

    const feed = await activityRepo.listByProject(projectA.id, {});
    expect(feed.items[0]).toMatchObject({ type: 'entity_created', subjectId: reference.id });
  });

  it('reuses the existing reference on a second attach, past the old 200-item scan limit', async () => {
    // Past what the removed REFERENCE_SEARCH_LIMIT scanned: proves the fix is
    // a real lookup, not a page that happens to still cover this case.
    for (let index = 0; index < 205; index += 1) {
      await entityService.create(projectA.id, { type: 'asset_reference', name: `filler-${index}` });
    }

    const first = await entityService.findOrCreateAssetReference(projectA.id, 'asset-1', {
      name: 'portrait.png',
    });
    const second = await entityService.findOrCreateAssetReference(projectA.id, 'asset-1', {
      name: 'portrait.png',
    });

    expect(second.id).toBe(first.id);

    const page = await entityService.listByProject(projectA.id, {
      types: ['asset_reference'],
      includeArchived: true,
    });
    expect(page.items.filter((item) => item.data.assetId === 'asset-1')).toHaveLength(1);
  });

  it('reuses an archived reference rather than creating a second one', async () => {
    const first = await entityService.findOrCreateAssetReference(projectA.id, 'asset-1', {
      name: 'portrait.png',
    });
    await entityService.archive(projectA.id, first.id);

    const second = await entityService.findOrCreateAssetReference(projectA.id, 'asset-1', {
      name: 'portrait.png',
    });

    expect(second.id).toBe(first.id);
    expect(second.status).toBe('archived');
  });

  it('never resolves a reference belonging to another project', async () => {
    const inA = await entityService.findOrCreateAssetReference(projectA.id, 'shared-asset-id', {
      name: 'portrait.png',
    });
    const inB = await entityService.findOrCreateAssetReference(projectB.id, 'shared-asset-id', {
      name: 'portrait.png',
    });

    expect(inB.id).not.toBe(inA.id);
    expect(inB.projectId).toBe(projectB.id);
  });

  it('rejects attaching an asset in a project that does not exist', async () => {
    await expect(
      entityService.findOrCreateAssetReference('missing-project', 'asset-1', { name: 'x' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects attaching an asset in an archived project', async () => {
    await projectService.archive(projectB.id);

    await expect(
      entityService.findOrCreateAssetReference(projectB.id, 'asset-1', { name: 'x' }),
    ).rejects.toThrow(ConflictError);
  });
});
