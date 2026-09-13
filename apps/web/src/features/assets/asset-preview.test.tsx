// @vitest-environment jsdom
import type { Asset, AssetSummary } from '@level-zero/domain';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssetPreview } from './asset-preview';

vi.mock('@/lib/api', () => ({
  assetContentUrl: (projectId: string, assetId: string) =>
    `https://api.test/projects/${projectId}/assets/${assetId}/content`,
}));

afterEach(() => {
  cleanup();
});

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'ast_source',
    projectId: 'prj_1',
    kind: 'image',
    filename: 'kael-suit.png',
    mimeType: 'image/png',
    byteSize: 2_048_000,
    storageKey: 'projects/prj_1/assets/ast_source',
    checksum: 'abc123',
    width: 1920,
    height: 1080,
    durationSeconds: null,
    variant: 'source',
    sourceAssetId: null,
    status: 'active',
    createdAt: new Date('2026-01-10T12:00:00Z'),
    updatedAt: new Date('2026-01-10T12:00:00Z'),
    archivedAt: null,
    createdBy: null,
    ...overrides,
  };
}

function summary(overrides: Partial<AssetSummary> = {}): AssetSummary {
  return {
    assetId: 'ast_source',
    origin: 'imported',
    generation: null,
    markKinds: [],
    selections: [],
    approved: false,
    linkedEntities: { entities: [], total: 0 },
    thumbnailAssetId: null,
    ...overrides,
  };
}

describe('AssetPreview', () => {
  it("renders the source's own content url when there is no summary", () => {
    render(<AssetPreview projectId="prj_1" asset={asset()} />);

    expect(screen.getByRole('img').getAttribute('src')).toBe(
      'https://api.test/projects/prj_1/assets/ast_source/content',
    );
  });

  it('falls back to the source when the summary carries no thumbnail', () => {
    render(<AssetPreview projectId="prj_1" asset={asset()} summary={summary()} />);

    expect(screen.getByRole('img').getAttribute('src')).toBe(
      'https://api.test/projects/prj_1/assets/ast_source/content',
    );
  });

  it('prefers the generated thumbnail when the summary carries one', () => {
    render(
      <AssetPreview
        projectId="prj_1"
        asset={asset()}
        summary={summary({ thumbnailAssetId: 'ast_thumb' })}
      />,
    );

    expect(screen.getByRole('img').getAttribute('src')).toBe(
      'https://api.test/projects/prj_1/assets/ast_thumb/content',
    );
  });

  it('renders a placeholder, never a broken thumbnail reference, for a non-image asset', () => {
    render(
      <AssetPreview
        projectId="prj_1"
        asset={asset({ kind: 'video', mimeType: 'video/mp4' })}
        summary={summary({ thumbnailAssetId: 'ast_thumb' })}
      />,
    );

    expect(screen.queryByRole('img')).toBeNull();
  });
});
