import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import { comparePrototypeVersions } from './compare';
import {
  annotatePrototypeVersion,
  createPrototypeVersion,
  type CreatePrototypeVersionInput,
  type PrototypeVersion,
} from './prototype-version';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const laterClock = fixedClock('2026-03-01T09:05:00.000Z');

const input = (
  overrides: Partial<CreatePrototypeVersionInput> = {},
): CreatePrototypeVersionInput => ({
  projectId: 'project-1',
  prototypeId: 'prototype-1',
  versionNumber: 1,
  members: [{ entityId: 'entity-1', entityVersionId: 'version-1' }],
  ...overrides,
});

const version = (overrides: Partial<CreatePrototypeVersionInput> = {}): PrototypeVersion =>
  createPrototypeVersion(input(overrides), {
    clock,
    ids: sequentialIdGenerator('prototype-version'),
  });

describe('createPrototypeVersion', () => {
  it('records the pinned members in the order they were given', () => {
    const captured = version({
      name: '  Vertical slice  ',
      notes: 'first playable',
      members: [
        { entityId: 'entity-2', entityVersionId: 'version-2' },
        { entityId: 'entity-1', entityVersionId: 'version-1' },
      ],
    });

    expect(captured).toMatchObject({
      projectId: 'project-1',
      prototypeId: 'prototype-1',
      versionNumber: 1,
      name: 'Vertical slice',
      status: 'draft',
      notes: 'first playable',
      buildAssetId: null,
      createdBy: null,
    });
    expect(captured.members).toEqual([
      { entityId: 'entity-2', entityVersionId: 'version-2' },
      { entityId: 'entity-1', entityVersionId: 'version-1' },
    ]);
  });

  it('rejects the same entity twice, which has no sensible winner', () => {
    expect(() =>
      version({
        members: [
          { entityId: 'entity-1', entityVersionId: 'version-1' },
          { entityId: 'entity-1', entityVersionId: 'version-2' },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it('rejects a member with no version pinned to it', () => {
    expect(() => version({ members: [{ entityId: 'entity-1', entityVersionId: '' }] })).toThrow(
      ValidationError,
    );
  });

  it('accepts a version with nothing in it yet', () => {
    expect(version({ members: [] }).members).toEqual([]);
  });
});

describe('annotatePrototypeVersion', () => {
  it('updates status, notes and the build artifact without touching the pins', () => {
    const captured = version();

    const annotated = annotatePrototypeVersion(
      captured,
      { status: 'playable', notes: 'ship it', buildAssetId: 'asset-1' },
      { clock: laterClock },
    );

    expect(annotated).toMatchObject({
      status: 'playable',
      notes: 'ship it',
      buildAssetId: 'asset-1',
      updatedAt: laterClock.now(),
    });
    expect(annotated.members).toEqual(captured.members);
    expect(captured.status).toBe('draft');
  });

  it('clears the build artifact when it is explicitly unset', () => {
    const built = annotatePrototypeVersion(version(), { buildAssetId: 'asset-1' }, { clock });

    expect(
      annotatePrototypeVersion(built, { buildAssetId: null }, { clock }).buildAssetId,
    ).toBeNull();
  });
});

describe('comparePrototypeVersions', () => {
  it('separates added, removed and changed entity versions', () => {
    const first = version({
      members: [
        { entityId: 'diver', entityVersionId: 'diver-v1' },
        { entityId: 'oxygen', entityVersionId: 'oxygen-v1' },
        { entityId: 'trench', entityVersionId: 'trench-v1' },
      ],
    });
    const second = version({
      versionNumber: 2,
      members: [
        { entityId: 'diver', entityVersionId: 'diver-v4' },
        { entityId: 'oxygen', entityVersionId: 'oxygen-v1' },
        { entityId: 'wreck', entityVersionId: 'wreck-v1' },
      ],
    });

    const comparison = comparePrototypeVersions(first, second);

    expect(comparison.changed).toEqual([{ entityId: 'diver', from: 'diver-v1', to: 'diver-v4' }]);
    expect(comparison.added).toEqual([{ entityId: 'wreck', from: null, to: 'wreck-v1' }]);
    expect(comparison.removed).toEqual([{ entityId: 'trench', from: 'trench-v1', to: null }]);
  });

  it('reports nothing for two versions pinning the same set', () => {
    const first = version();
    const second = version({ versionNumber: 2 });

    expect(comparePrototypeVersions(first, second)).toMatchObject({
      added: [],
      removed: [],
      changed: [],
    });
  });
});
