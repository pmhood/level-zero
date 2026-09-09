import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  createMoodboardNode,
  DEFAULT_MOODBOARD_NODE_SIZE,
  updateMoodboardNode,
  type CreateMoodboardNodeInput,
} from './moodboard-node';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const later = fixedClock('2026-03-01T10:00:00.000Z');

function deps() {
  return { clock, ids: sequentialIdGenerator('node') };
}

function node(overrides: Partial<CreateMoodboardNodeInput> = {}) {
  return createMoodboardNode(
    { projectId: 'prj_1', boardId: 'board_1', type: 'text', ...overrides },
    deps(),
  );
}

describe('createMoodboardNode', () => {
  it('defaults to a visible square at the origin', () => {
    const created = node();

    expect(created).toMatchObject({
      x: 0,
      y: 0,
      width: DEFAULT_MOODBOARD_NODE_SIZE,
      height: DEFAULT_MOODBOARD_NODE_SIZE,
      rotation: 0,
      zOrder: 0,
      locked: false,
      groupId: null,
      data: {},
    });
  });

  it('keeps every layout field it was given', () => {
    const created = node({ x: -120.5, y: 40, width: 320, height: 180, rotation: 1.2, zOrder: 7 });

    expect(created).toMatchObject({
      x: -120.5,
      y: 40,
      width: 320,
      height: 180,
      rotation: 1.2,
      zOrder: 7,
    });
  });

  it('requires an asset node to name an asset, and only an asset', () => {
    expect(() => node({ type: 'asset' })).toThrow(ValidationError);
    expect(() => node({ type: 'asset', assetId: 'asset_1', entityId: 'ent_1' })).toThrow(
      ValidationError,
    );
    expect(node({ type: 'asset', assetId: 'asset_1' })).toMatchObject({
      assetId: 'asset_1',
      entityId: null,
    });
  });

  it('requires an entity node to name an entity', () => {
    expect(() => node({ type: 'entity' })).toThrow(ValidationError);
    expect(node({ type: 'entity', entityId: 'ent_1' })).toMatchObject({
      assetId: null,
      entityId: 'ent_1',
    });
  });

  it('refuses a reference on a node type that shows its own content', () => {
    expect(() => node({ type: 'note', assetId: 'asset_1' })).toThrow(ValidationError);
    expect(() => node({ type: 'palette', entityId: 'ent_1' })).toThrow(ValidationError);
    expect(() => node({ type: 'group', assetId: 'asset_1' })).toThrow(ValidationError);
  });

  it('rejects a size that would make the node invisible', () => {
    expect(() => node({ width: 0 })).toThrow(ValidationError);
    expect(() => node({ height: -10 })).toThrow(ValidationError);
  });

  it('rejects coordinates that are not finite numbers', () => {
    expect(() => node({ x: Number.NaN })).toThrow(ValidationError);
    expect(() => node({ y: Number.POSITIVE_INFINITY })).toThrow(ValidationError);
    expect(() => node({ zOrder: 1.5 })).toThrow(ValidationError);
  });
});

describe('updateMoodboardNode', () => {
  it('applies a transform without mutating the original', () => {
    const original = node({ x: 10, y: 10, width: 100, height: 100 });

    const moved = updateMoodboardNode(
      original,
      { x: 250, y: -80, width: 400, height: 300, rotation: Math.PI / 4, zOrder: 3 },
      { clock: later },
    );

    expect(moved).toMatchObject({
      x: 250,
      y: -80,
      width: 400,
      height: 300,
      rotation: Math.PI / 4,
      zOrder: 3,
    });
    expect(moved.updatedAt).toEqual(later.now());
    expect(original).toMatchObject({ x: 10, y: 10, width: 100, height: 100, rotation: 0 });
  });

  it('leaves untouched fields alone', () => {
    const original = node({ x: 10, y: 20, rotation: 0.5, locked: true });

    const moved = updateMoodboardNode(original, { x: 99 }, { clock: later });

    expect(moved).toMatchObject({ x: 99, y: 20, rotation: 0.5, locked: true });
  });

  it('replaces data wholesale so a field can be removed', () => {
    const original = node({ data: { text: 'gloomy', color: '#123456' } });

    const edited = updateMoodboardNode(original, { data: { text: 'brighter' } }, { clock: later });

    expect(edited.data).toEqual({ text: 'brighter' });
  });

  it('cannot re-point a placement at something else', () => {
    const original = node({ type: 'asset', assetId: 'asset_1' });

    // `assetId` is not part of the patch type; it is ignored even if sent.
    const edited = updateMoodboardNode(
      original,
      { assetId: 'asset_2' } as Parameters<typeof updateMoodboardNode>[1],
      { clock: later },
    );

    expect(edited.assetId).toBe('asset_1');
  });

  it('rejects an invalid transform rather than storing it', () => {
    const original = node();

    expect(() => updateMoodboardNode(original, { width: 0 }, { clock: later })).toThrow(
      ValidationError,
    );
    expect(() => updateMoodboardNode(original, { rotation: Number.NaN }, { clock: later })).toThrow(
      ValidationError,
    );
  });
});
