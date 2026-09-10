import { type Asset, type Entity } from '@level-zero/domain';

import * as api from '@/lib/api';

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
 * The lookup and the create race are both resolved server-side in one atomic
 * request — see `EntityService.findOrCreateAssetReference` — rather than by
 * scanning a page of candidates here, which cannot stay correct as a project's
 * reference count grows.
 *
 * Archived references are found too, for the same reason: a re-linked asset
 * should recover the entity that already carries its history.
 */
export async function findOrCreateAssetReference(projectId: string, asset: Asset): Promise<Entity> {
  return api.findOrCreateAssetReference(projectId, { assetId: asset.id, name: asset.filename });
}
