import type { Asset, Entity, NeighborEdge } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import { resolveVisuals, unlinkedAssets } from './character-visual';

// Fixed so a builder called twice — once for the input, once for the expectation —
// produces equal timestamps. These tests assert on pairing, never on time.
const FIXED_TIME = new Date('2026-01-01T00:00:00.000Z');

function entity(overrides: Partial<Entity>): Entity {
  return {
    id: 'ent_ref',
    projectId: 'prj_1',
    type: 'asset_reference',
    name: 'kael-portrait.png',
    description: null,
    status: 'active',
    tags: [],
    data: {},
    currentVersionId: null,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    archivedAt: null,
    ...overrides,
  };
}

function edge(relationshipId: string, target: Entity): NeighborEdge {
  return {
    relationship: {
      id: relationshipId,
      projectId: 'prj_1',
      sourceEntityId: 'ent_kael',
      targetEntityId: target.id,
      relation: 'references',
      metadata: {},
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME,
    },
    direction: 'outgoing',
    entity: target,
  };
}

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'ast_portrait',
    projectId: 'prj_1',
    kind: 'image',
    filename: 'kael-portrait.png',
    mimeType: 'image/png',
    byteSize: 1024,
    storageKey: 'projects/prj_1/kael-portrait.png',
    checksum: 'abc',
    width: 800,
    height: 1000,
    durationSeconds: null,
    variant: 'source',
    sourceAssetId: null,
    status: 'active',
    pipelineStage: 'concept',
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    archivedAt: null,
    createdBy: null,
    ...overrides,
  };
}

describe('resolveVisuals', () => {
  it('pairs an asset reference with the asset it names', () => {
    const reference = entity({ id: 'ent_ref', data: { assetId: 'ast_portrait' } });

    expect(resolveVisuals([edge('rel_1', reference)], [asset()])).toEqual([
      { relationshipId: 'rel_1', reference, asset: asset() },
    ]);
  });

  it('ignores edges to anything that is not an asset reference', () => {
    const faction = entity({ id: 'ent_dockers', type: 'faction', name: 'The Dockers' });

    expect(resolveVisuals([edge('rel_1', faction)], [asset()])).toEqual([]);
  });

  it('keeps a reference whose asset is gone, so the broken link can be fixed', () => {
    const reference = entity({ id: 'ent_ref', data: { assetId: 'ast_deleted' } });

    const [visual] = resolveVisuals([edge('rel_1', reference)], [asset()]);

    expect(visual).toMatchObject({ relationshipId: 'rel_1', asset: null });
  });

  it('keeps a reference that names no asset at all', () => {
    const reference = entity({ id: 'ent_ref', data: {} });

    expect(resolveVisuals([edge('rel_1', reference)], [asset()])[0]?.asset).toBeNull();
  });
});

describe('unlinkedAssets', () => {
  it('leaves out the assets already linked, so the picker never offers a duplicate', () => {
    const linked = asset();
    const other = asset({ id: 'ast_turnaround', filename: 'kael-turnaround.png' });
    const visuals = resolveVisuals(
      [edge('rel_1', entity({ data: { assetId: linked.id } }))],
      [linked, other],
    );

    expect(unlinkedAssets([linked, other], visuals)).toEqual([other]);
  });

  it('offers every asset when a broken reference resolves to nothing', () => {
    const available = asset();
    const visuals = resolveVisuals(
      [edge('rel_1', entity({ data: { assetId: 'ast_deleted' } }))],
      [available],
    );

    expect(unlinkedAssets([available], visuals)).toEqual([available]);
  });
});
