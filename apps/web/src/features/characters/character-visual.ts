import {
  referencedAssetId,
  type Asset,
  type Entity,
  type NeighborEdge,
  type RelationType,
} from '@level-zero/domain';

/**
 * How a character points at the images that picture it.
 *
 * Visuals are reusable `Asset` rows, reached through an `asset_reference`
 * entity and an ordinary edge — the mechanism `asset-reference.ts` describes,
 * and the reason there is no `character_images` table. The same portrait can
 * hang in a moodboard and sit in the GDD without being copied, and unlinking
 * it here removes one edge rather than deleting anyone else's picture.
 */
export const VISUAL_RELATION = 'references' satisfies RelationType;

/**
 * One picture of a character: the edge, the reference entity between, and the
 * file — or `null` for the file, when the reference no longer resolves.
 */
export interface CharacterVisual {
  /** Removing this edge unlinks the visual; the asset and reference survive. */
  relationshipId: string;
  reference: Entity;
  asset: Asset | null;
}

/**
 * Pairs a character's outgoing `asset_reference` edges with the assets they
 * name.
 *
 * A reference whose asset is missing from `assets` — deleted, or scoped to
 * another project — keeps its place with a null asset rather than vanishing.
 * Silently dropping it would hide a broken link instead of offering to fix it.
 */
export function resolveVisuals(
  edges: readonly NeighborEdge[],
  assets: readonly Asset[],
): CharacterVisual[] {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));

  return edges
    .filter((edge) => edge.entity.type === 'asset_reference')
    .map((edge) => {
      const assetId = referencedAssetId(edge.entity);
      return {
        relationshipId: edge.relationship.id,
        reference: edge.entity,
        asset: assetId === null ? null : (byId.get(assetId) ?? null),
      };
    });
}

/** The assets not already linked, so the picker never offers a duplicate. */
export function unlinkedAssets(
  assets: readonly Asset[],
  visuals: readonly CharacterVisual[],
): Asset[] {
  const linked = new Set(visuals.map((visual) => visual.asset?.id));
  return assets.filter((asset) => !linked.has(asset.id));
}
