import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import { applyProjectUpdate, archiveProject, createProject, restoreProject } from './project';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const later = fixedClock('2026-03-05T09:00:00.000Z');
const deps = () => ({ clock, ids: sequentialIdGenerator('project') });

describe('createProject', () => {
  it('creates an active project', () => {
    const project = createProject({ name: 'Deep Fathom' }, deps());

    expect(project).toMatchObject({
      id: 'project-1',
      name: 'Deep Fathom',
      description: null,
      status: 'active',
      archivedAt: null,
    });
    expect(project.createdAt).toEqual(project.updatedAt);
  });

  it('trims the name', () => {
    expect(createProject({ name: '  Deep Fathom ' }, deps()).name).toBe('Deep Fathom');
  });

  it('rejects an empty name', () => {
    expect(() => createProject({ name: '  ' }, deps())).toThrow(ValidationError);
  });

  it('rejects a name that is too long', () => {
    expect(() => createProject({ name: 'x'.repeat(201) }, deps())).toThrow(/at most 200/);
  });
});

describe('applyProjectUpdate', () => {
  it('updates the name without touching creation time', () => {
    const project = createProject({ name: 'Deep Fathom' }, deps());
    const updated = applyProjectUpdate(project, { name: 'Deep Fathom II' }, { clock: later });

    expect(updated.name).toBe('Deep Fathom II');
    expect(updated.createdAt).toEqual(project.createdAt);
    expect(updated.updatedAt.toISOString()).toBe('2026-03-05T09:00:00.000Z');
    expect(project.name).toBe('Deep Fathom');
  });
});

describe('archiveProject / restoreProject', () => {
  it('archives and restores', () => {
    const project = createProject({ name: 'Deep Fathom' }, deps());
    const archived = archiveProject(project, { clock: later });

    expect(archived).toMatchObject({ status: 'archived' });
    expect(archived.archivedAt).not.toBeNull();
    expect(restoreProject(archived, { clock: later })).toMatchObject({
      status: 'active',
      archivedAt: null,
    });
  });

  it('rejects archiving twice and restoring an active project', () => {
    const project = createProject({ name: 'Deep Fathom' }, deps());

    expect(() => restoreProject(project, { clock: later })).toThrow(ValidationError);
    const archived = archiveProject(project, { clock: later });
    expect(() => archiveProject(archived, { clock: later })).toThrow(ValidationError);
  });
});
