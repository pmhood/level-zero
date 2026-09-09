import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import { archiveAsset, createAsset, restoreAsset } from './asset';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const later = fixedClock('2026-03-05T09:00:00.000Z');
const deps = () => ({ clock, ids: sequentialIdGenerator('asset') });

const baseInput = {
  projectId: 'project-1',
  kind: 'image' as const,
  filename: 'kael-portrait.png',
  mimeType: 'image/png',
  byteSize: 2048,
  storageKey: 'project-1/asset-1/kael-portrait.png',
  checksum: 'abc123',
};

describe('createAsset', () => {
  it('creates an active source asset', () => {
    const asset = createAsset(baseInput, deps());

    expect(asset).toMatchObject({
      id: 'asset-1',
      projectId: 'project-1',
      kind: 'image',
      filename: 'kael-portrait.png',
      variant: 'source',
      sourceAssetId: null,
      status: 'active',
      archivedAt: null,
      width: null,
      height: null,
      durationSeconds: null,
      createdBy: null,
    });
    expect(asset.createdAt).toEqual(asset.updatedAt);
  });

  it('accepts width, height and duration', () => {
    const asset = createAsset(
      { ...baseInput, kind: 'video', width: 1920, height: 1080, durationSeconds: 12.5 },
      deps(),
    );

    expect(asset).toMatchObject({ width: 1920, height: 1080, durationSeconds: 12.5 });
  });

  it('records who created it', () => {
    const asset = createAsset({ ...baseInput, createdBy: 'pete' }, deps());

    expect(asset.createdBy).toBe('pete');
  });

  it.each([
    ['an unknown kind', { kind: 'spreadsheet' }],
    ['a blank filename', { filename: '   ' }],
    ['a blank mimeType', { mimeType: '' }],
    ['a negative byte size', { byteSize: -1 }],
    ['a fractional byte size', { byteSize: 1.5 }],
    ['a blank storage key', { storageKey: '' }],
    ['a blank checksum', { checksum: '' }],
    ['a zero width', { width: 0 }],
    ['a negative duration', { durationSeconds: -1 }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => createAsset({ ...baseInput, ...overrides } as never, deps())).toThrow(
      ValidationError,
    );
  });

  it('creates a derivative that declares its source', () => {
    const source = createAsset(baseInput, deps());
    const thumbnail = createAsset(
      {
        ...baseInput,
        filename: 'kael-portrait-thumb.png',
        variant: 'thumbnail',
        sourceAssetId: source.id,
      },
      deps(),
    );

    expect(thumbnail).toMatchObject({ variant: 'thumbnail', sourceAssetId: source.id });
  });

  it('rejects a source asset that declares its own sourceAssetId', () => {
    expect(() => createAsset({ ...baseInput, sourceAssetId: 'asset-9' }, deps())).toThrow(
      /cannot declare its own sourceAssetId/,
    );
  });

  it('rejects a derivative with no declared source', () => {
    expect(() => createAsset({ ...baseInput, variant: 'thumbnail' }, deps())).toThrow(
      /must declare the asset it derives from/,
    );
  });
});

describe('archiveAsset / restoreAsset', () => {
  it('archives and restores', () => {
    const asset = createAsset(baseInput, deps());
    const archived = archiveAsset(asset, { clock: later });

    expect(archived).toMatchObject({ status: 'archived' });
    expect(archived.archivedAt).not.toBeNull();
    expect(restoreAsset(archived, { clock: later })).toMatchObject({
      status: 'active',
      archivedAt: null,
    });
  });

  it('rejects archiving twice and restoring an active asset', () => {
    const asset = createAsset(baseInput, deps());

    expect(() => restoreAsset(asset, { clock: later })).toThrow(ValidationError);
    const archived = archiveAsset(asset, { clock: later });
    expect(() => archiveAsset(archived, { clock: later })).toThrow(ValidationError);
  });
});
