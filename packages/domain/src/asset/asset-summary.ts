/** Whether an asset was produced by a generation or uploaded directly. */
export const ASSET_ORIGINS = ['generated', 'imported'] as const;
export type AssetOrigin = (typeof ASSET_ORIGINS)[number];

/**
 * The few fields a badge needs to say which generation produced an asset. No
 * prompt text or provider metadata: the inspector reads the full record from
 * `GET /generations/:id/provenance`.
 */
export interface AssetGenerationOrigin {
  generationId: string;
  capability: string;
  provider: string | null;
  model: string | null;
}

/**
 * The facts about an asset that don't live on the `assets` row itself,
 * joined in from the aggregates that record them — one flat field per facet.
 * This issue lands `origin`; #200 (marks), #201 (selection state) and #202
 * (linked entities) each add one more field alongside it.
 */
export interface AssetSummary {
  assetId: string;
  origin: AssetOrigin;
  /** Set only when `origin` is `'generated'`. Null for an imported asset. */
  generation: AssetGenerationOrigin | null;
}
