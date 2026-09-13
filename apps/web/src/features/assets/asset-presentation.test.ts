import type { Asset, AssetSummary } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import {
  assetKindLabel,
  assetStatusBadge,
  formatByteSize,
  formatDate,
  formatDimensionsOrDuration,
  formatDuration,
  formatDimensions,
  formatRelativeTime,
} from './asset-presentation';

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'ast_1',
    projectId: 'prj_1',
    kind: 'image',
    filename: 'kael-suit.png',
    mimeType: 'image/png',
    byteSize: 2048,
    storageKey: 'projects/prj_1/assets/ast_1',
    checksum: 'abc123',
    width: 1920,
    height: 1080,
    durationSeconds: null,
    variant: 'source',
    sourceAssetId: null,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    createdBy: null,
    ...overrides,
  };
}

function summary(overrides: Partial<AssetSummary> = {}): AssetSummary {
  return {
    assetId: 'ast_1',
    origin: 'imported',
    generation: null,
    markKinds: [],
    selections: [],
    approved: false,
    linkedEntities: { entities: [], total: 0 },
    ...overrides,
  };
}

describe('assetKindLabel', () => {
  it('gives every asset kind a human label', () => {
    expect(assetKindLabel('model_3d')).toBe('3D Model');
    expect(assetKindLabel('build_artifact')).toBe('Build Artifact');
    expect(assetKindLabel('image')).toBe('Image');
  });
});

describe('assetStatusBadge', () => {
  it('puts archived ahead of every derived state', () => {
    const archived = asset({ status: 'archived' });
    expect(assetStatusBadge(archived, summary({ approved: true }))).toEqual({
      tone: 'neutral',
      label: 'Archived',
    });
  });

  it('reads approved from the summary, not the asset row', () => {
    expect(assetStatusBadge(asset(), summary({ approved: true }))).toEqual({
      tone: 'success',
      label: 'Approved',
    });
  });

  it('marks a generated asset with the AI treatment when it is not approved', () => {
    expect(assetStatusBadge(asset(), summary({ origin: 'generated' }))).toEqual({
      tone: 'neutral',
      label: 'Generated',
      ai: true,
    });
  });

  it('falls back to the reference kind when nothing else applies', () => {
    expect(assetStatusBadge(asset({ kind: 'reference' }), summary())).toEqual({
      tone: 'neutral',
      label: 'Reference',
    });
  });

  it('renders no badge for a plain imported, unapproved, non-reference asset', () => {
    expect(assetStatusBadge(asset(), summary())).toBeNull();
  });

  it('renders no badge when the summary has not loaded yet', () => {
    expect(assetStatusBadge(asset(), undefined)).toBeNull();
  });
});

describe('formatByteSize', () => {
  it('picks the unit that keeps the number readable', () => {
    expect(formatByteSize(512)).toBe('512 B');
    expect(formatByteSize(2048)).toBe('2.0 KB');
    expect(formatByteSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('formatDimensions and formatDuration', () => {
  it('formats width and height together, or nothing when either is missing', () => {
    expect(formatDimensions(1920, 1080)).toBe('1920 × 1080');
    expect(formatDimensions(null, 1080)).toBeNull();
  });

  it('formats seconds as minutes:seconds', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(null)).toBeNull();
  });
});

describe('formatDimensionsOrDuration', () => {
  it('prefers dimensions, falls back to duration, then an em dash', () => {
    expect(formatDimensionsOrDuration(asset({ width: 800, height: 600 }))).toBe('800 × 600');
    expect(
      formatDimensionsOrDuration(
        asset({ width: null, height: null, durationSeconds: 12, kind: 'audio' }),
      ),
    ).toBe('0:12');
    expect(
      formatDimensionsOrDuration(
        asset({ width: null, height: null, durationSeconds: null, kind: 'export' }),
      ),
    ).toBe('—');
  });
});

describe('formatDate', () => {
  it('accepts a Date or the ISO string the API actually sends', () => {
    const date = new Date('2026-01-15T12:00:00Z');
    expect(formatDate(date)).toBe(formatDate(date.toISOString()));
  });
});

describe('formatRelativeTime', () => {
  it('describes a past timestamp relative to now', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(formatRelativeTime(twoHoursAgo)).toBe('2 hours ago');
  });

  it('reads a very recent timestamp as "just now"', () => {
    expect(formatRelativeTime(new Date())).toBe('just now');
  });
});
