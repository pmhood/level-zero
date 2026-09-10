import { assetReferenceData, referencedAssetId, type Asset, type Entity } from '@level-zero/domain';

import * as api from '@/lib/api';

/** How many `asset_reference` entities one lookup scans for an existing match. */
const REFERENCE_SEARCH_LIMIT = 200;

/**
 * The `asset_reference` entity standing for one asset, creating it only if the
 * project has none yet.
 *
 * An asset is not an entity, so anything that wants to *point* at a file — a
 * character's portrait, a moodboard tile, a generated result promoted to
 * canon — does it through one of these plus a relationship. One entity per
 * file is the part that matters: reusing it is what lets the same image hang
 * off a character, a location and a board without three copies of it, and what
 * makes the lineage on it the lineage of the file rather than of one link.
 *
 * Archived references are searched too, for the same reason: a re-linked asset
 * should recover the entity that already carries its history.
 */
export async function findOrCreateAssetReference(projectId: string, asset: Asset): Promise<Entity> {
  const references = await api.listEntities(projectId, {
    type: ['asset_reference'],
    includeArchived: true,
    limit: REFERENCE_SEARCH_LIMIT,
  });
  const existing = references.items.find((item) => referencedAssetId(item) === asset.id);

  return (
    existing ??
    (await api.createEntity(projectId, {
      type: 'asset_reference',
      name: asset.filename,
      status: 'active',
      data: assetReferenceData(asset.id),
    }))
  );
}
