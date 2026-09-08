import { beforeEach, describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { NotFoundError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import { InMemoryProjectRepository } from '../testing';
import { ProjectService } from './project-service';

let service: ProjectService;

beforeEach(() => {
  service = new ProjectService(new InMemoryProjectRepository(), {
    clock: fixedClock('2026-03-01T09:00:00.000Z'),
    ids: sequentialIdGenerator('project'),
  });
});

describe('ProjectService', () => {
  it('creates and reads back a project', async () => {
    const created = await service.create({ name: 'Deep Fathom' });

    await expect(service.getById(created.id)).resolves.toMatchObject({ name: 'Deep Fathom' });
  });

  it('reports a missing project as not found', async () => {
    await expect(service.getById('nope')).rejects.toThrow(NotFoundError);
  });

  it('lists projects with a total', async () => {
    await service.create({ name: 'Deep Fathom' });
    await service.create({ name: 'Sky Wreck' });

    await expect(service.list()).resolves.toMatchObject({ total: 2 });
  });

  it('filters archived projects out of a status-filtered list', async () => {
    const first = await service.create({ name: 'Deep Fathom' });
    await service.create({ name: 'Sky Wreck' });
    await service.archive(first.id);

    const active = await service.list({ statuses: ['active'] });

    expect(active.items.map((project) => project.name)).toEqual(['Sky Wreck']);
  });

  it('updates a project', async () => {
    const created = await service.create({ name: 'Deep Fathom' });
    await service.update(created.id, { description: 'A sunken-city survival game' });

    await expect(service.getById(created.id)).resolves.toMatchObject({
      description: 'A sunken-city survival game',
    });
  });

  it('archives and restores', async () => {
    const created = await service.create({ name: 'Deep Fathom' });

    await expect(service.archive(created.id)).resolves.toMatchObject({ status: 'archived' });
    await expect(service.restore(created.id)).resolves.toMatchObject({ status: 'active' });
  });
});
