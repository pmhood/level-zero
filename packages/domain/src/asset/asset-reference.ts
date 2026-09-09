import { type Entity } from '../entity/entity';

/**
 * How an `asset_reference` entity points at the asset it represents.
 *
 * Entities keep type-specific fields in `data` precisely so a link like this
 * needs no schema, and no `assetId` column, of its own: a character's
 * portrait, a moodboard tile and a GDD figure can all point an
 * `asset_reference` entity at the *same* asset row, then relate that one
 * entity to as many other entities as a tool needs via
 * `EntityRelationshipService`. This is the whole mechanism the issue asks
 * for — no separate `character_images` or `moodboard_images` table.
 */
export const ASSET_REFERENCE_ASSET_ID_KEY = 'assetId';

/** Builds the `data` payload for an `asset_reference` entity that points at `assetId`. */
export function assetReferenceData(assetId: string): Record<string, unknown> {
  return { [ASSET_REFERENCE_ASSET_ID_KEY]: assetId };
}

/**
 * Reads the asset id an `asset_reference` entity points at, or `null` if
 * `entity` is not an `asset_reference`, or its `data` does not carry one.
 */
export function referencedAssetId(entity: Pick<Entity, 'type' | 'data'>): string | null {
  if (entity.type !== 'asset_reference') return null;
  const value = entity.data[ASSET_REFERENCE_ASSET_ID_KEY];
  return typeof value === 'string' ? value : null;
}
