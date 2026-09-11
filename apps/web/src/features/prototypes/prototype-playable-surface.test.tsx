// @vitest-environment jsdom
import type { Asset, PrototypeContents, PrototypeVersion } from '@level-zero/domain';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PrototypePlayableSurface } from './prototype-playable-surface';

vi.mock('@/lib/api', () => ({
  assetContentUrl: (projectId: string, assetId: string) => `/assets/${projectId}/${assetId}`,
}));

function version(overrides: Partial<PrototypeVersion> = {}): PrototypeVersion {
  return {
    id: 'pv_1',
    projectId: 'prj_1',
    prototypeId: 'ent_proto',
    versionNumber: 1,
    name: null,
    status: 'draft',
    notes: null,
    buildAssetId: null,
    members: [],
    createdBy: null,
    createdAt: new Date('2026-02-01'),
    updatedAt: new Date('2026-02-01'),
    ...overrides,
  };
}

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset_build',
    projectId: 'prj_1',
    kind: 'build_artifact',
    filename: 'build.zip',
    mimeType: 'application/zip',
    byteSize: 2048,
    storageKey: 'key',
    checksum: 'abc',
    width: null,
    height: null,
    durationSeconds: null,
    variant: 'source',
    sourceAssetId: null,
    status: 'active',
    createdAt: new Date('2026-02-01'),
    updatedAt: new Date('2026-02-01'),
    archivedAt: null,
    createdBy: null,
    ...overrides,
  };
}

function contents(overrides: Partial<PrototypeContents> = {}): PrototypeContents {
  return {
    prototype: {} as PrototypeContents['prototype'],
    version: version(),
    entityVersions: [],
    buildAsset: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe('PrototypePlayableSurface', () => {
  it('honestly says a design snapshot has no build, rather than implying it is runnable', () => {
    render(
      <PrototypePlayableSurface
        projectId="prj_1"
        contents={contents({ version: version({ status: 'draft', buildAssetId: null }) })}
      />,
    );

    expect(screen.getByText('No playable build for this version')).toBeDefined();
    expect(screen.getByText(/still a design snapshot/)).toBeDefined();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('gives a version marked playable but missing its artifact a distinct, still honest message', () => {
    render(
      <PrototypePlayableSurface
        projectId="prj_1"
        contents={contents({ version: version({ status: 'playable', buildAssetId: null }) })}
      />,
    );

    expect(screen.getByText('No playable build for this version')).toBeDefined();
    expect(screen.getByText(/nothing to run/)).toBeDefined();
  });

  it('embeds a browser-playable build directly', () => {
    render(
      <PrototypePlayableSurface
        projectId="prj_1"
        contents={contents({
          version: version({ status: 'playable', buildAssetId: 'asset_build' }),
          buildAsset: asset({ mimeType: 'text/html', filename: 'index.html' }),
        })}
      />,
    );

    const frame = screen.getByTitle('index.html — playable build');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('src')).toBe('/assets/prj_1/asset_build');
  });

  it('offers a build it cannot run in the browser as a file to open, not a fake player', () => {
    render(
      <PrototypePlayableSurface
        projectId="prj_1"
        contents={contents({
          version: version({ status: 'playable', buildAssetId: 'asset_build' }),
          buildAsset: asset({ mimeType: 'application/zip', filename: 'build.zip' }),
        })}
      />,
    );

    expect(screen.queryByTitle(/playable build/)).toBeNull();
    expect(screen.getByText(/can.t run inside Level Zero/)).toBeDefined();
    const openLink = screen.getByRole('link', { name: 'Open build' });
    expect(openLink.getAttribute('href')).toBe('/assets/prj_1/asset_build');
    expect(openLink.getAttribute('target')).toBe('_blank');
  });
});
