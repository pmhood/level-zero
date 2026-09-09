import { describe, expect, it } from 'vitest';

import { createEntity } from '../entity/entity';
import { fixedClock } from '../shared/clock';
import { sequentialIdGenerator } from '../shared/id';
import { assetReferenceData, referencedAssetId } from './asset-reference';

const deps = {
  clock: fixedClock('2026-03-01T09:00:00.000Z'),
  ids: sequentialIdGenerator('entity'),
};

describe('assetReferenceData / referencedAssetId', () => {
  it('round-trips the asset id through an asset_reference entity', () => {
    const entity = createEntity(
      {
        projectId: 'project-1',
        type: 'asset_reference',
        name: 'Kael portrait',
        data: assetReferenceData('asset-1'),
      },
      deps,
    );

    expect(referencedAssetId(entity)).toBe('asset-1');
  });

  it('returns null for an entity that is not an asset_reference', () => {
    const entity = createEntity(
      { projectId: 'project-1', type: 'character', name: 'Kael', data: { assetId: 'asset-1' } },
      deps,
    );

    expect(referencedAssetId(entity)).toBeNull();
  });

  it('returns null when an asset_reference carries no assetId', () => {
    const entity = createEntity(
      { projectId: 'project-1', type: 'asset_reference', name: 'Kael portrait' },
      deps,
    );

    expect(referencedAssetId(entity)).toBeNull();
  });
});
