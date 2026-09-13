import { type EntityType } from '../entity/entity-type';
import { type AssetMarkKind } from '../selection/asset-mark';
import {
  latestSelectionByAsset,
  type AssetSelection,
  type AssetSelectionContext,
  type AssetSelectionState,
} from '../selection/asset-selection';

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
 * Where an asset currently stands in one context it was considered for — the
 * newest decision for that `(entityId, purpose)` pair, and nothing else. The
 * fuller history, notes and actor are the inspector's, from
 * `AssetSelectionRepository.listByAsset`; this is only what a badge and a
 * filter need.
 */
export interface AssetSelectionSummaryEntry {
  context: AssetSelectionContext;
  state: AssetSelectionState;
  decidedAt: Date;
}

/** The few fields a "used by" badge needs to name an entity that links to an asset. */
export interface AssetLinkedEntity {
  entityId: string;
  type: EntityType;
  name: string;
}

/**
 * How many linked entities `AssetLinkedEntitiesSummary.entities` carries
 * before falling back to a "+N" count. The inspector's Usage tab
 * (#173, via `EntityRelationshipService`) is where the full list lives; this
 * is only what a grid tile needs.
 */
export const ASSET_LINKED_ENTITIES_CAP = 4;

/**
 * The entities that reference an asset — through its `asset_reference`
 * entity's relationships, two hops from the asset itself — each counted
 * once no matter how many edges relate it, capped at
 * `ASSET_LINKED_ENTITIES_CAP` with `total` holding the full distinct count
 * so a tile can say "Kira, Ravine Outpost, +4".
 */
export interface AssetLinkedEntitiesSummary {
  /** Up to `ASSET_LINKED_ENTITIES_CAP` entities, alphabetical by name. */
  entities: AssetLinkedEntity[];
  /** Distinct entities linked to this asset. May exceed `entities.length`. */
  total: number;
}

/**
 * The facts about an asset that don't live on the `assets` row itself,
 * joined in from the aggregates that record them — one flat field per facet.
 * #170 landed `origin`, #200 added `markKinds`, #201 added
 * `selections`/`approved`, and this issue (#202) adds `linkedEntities`.
 */
export interface AssetSummary {
  assetId: string;
  origin: AssetOrigin;
  /** Set only when `origin` is `'generated'`. Null for an imported asset. */
  generation: AssetGenerationOrigin | null;
  /** The mark kinds on this asset, in ASSET_MARK_KINDS order. Empty array if none. */
  markKinds: AssetMarkKind[];
  /**
   * The asset's current selection state in every context it was considered
   * for — one entry per context, folded to the newest decision the same way
   * `latestSelectionByAsset` folds it. Empty array if it was never selected.
   */
  selections: AssetSelectionSummaryEntry[];
  /**
   * The project-wide reading the grid pill needs: approved in at least one
   * context. Derived from `selections`, never stored — an asset can be
   * approved for one purpose and rejected for another at the same time, and
   * both stay true underneath this one flag.
   */
  approved: boolean;
  /**
   * Who this asset is used by — the entities reachable from it through its
   * `asset_reference` entity. Zero entities and a zero total both when there
   * is no `asset_reference` entity for this asset and when there is one but
   * it relates to nothing.
   */
  linkedEntities: AssetLinkedEntitiesSummary;
}

/** Project-wide "approved": true when the asset is approved in at least one context. */
export function isApprovedInAnyContext(selections: readonly AssetSelectionSummaryEntry[]): boolean {
  return selections.some((entry) => entry.state === 'approved');
}

/**
 * Folds a batch of selection rows — any mix of assets and contexts — down to
 * one current-state entry per `(asset, context)`.
 *
 * `selections` must be newest first, the same order every repository read
 * promises: groups are built by a single pass over the input, so a group
 * stays newest-first as long as the whole array was. Groups by context
 * first, exactly as `currentAssetSelectionsByPurpose` does, then hands each
 * group to `latestSelectionByAsset` so the newest row per asset is the
 * one already-tested fold rather than a new precedence rule. Shared
 * between the Postgres adapter and the in-memory test double, the same way
 * `pickNewestOrigin` is shared for origin, so the rule has exactly one
 * place to change.
 */
export function summarizeCurrentSelections(
  selections: readonly AssetSelection[],
): Map<string, AssetSelectionSummaryEntry[]> {
  const byContext = new Map<string, AssetSelection[]>();
  for (const selection of selections) {
    // Keyed by JSON.stringify rather than a joined string: `purpose` is a
    // caller-supplied label that may contain any delimiter this code could
    // pick instead.
    const key = JSON.stringify([selection.context.entityId, selection.context.purpose]);
    const group = byContext.get(key) ?? [];
    group.push(selection);
    byContext.set(key, group);
  }

  const summaries = new Map<string, AssetSelectionSummaryEntry[]>();
  for (const group of byContext.values()) {
    for (const selection of latestSelectionByAsset(group).values()) {
      const entries = summaries.get(selection.assetId) ?? [];
      entries.push({
        context: selection.context,
        state: selection.state,
        decidedAt: selection.decidedAt,
      });
      summaries.set(selection.assetId, entries);
    }
  }

  return summaries;
}

/** The minimum a generation candidate needs to carry to be picked between. */
export interface OriginCandidate {
  id: string;
  createdAt: Date;
}

/**
 * The tiebreak for an asset produced by more than one generation: the most
 * recently created one wins, ties broken by id. Shared between the Postgres
 * adapter and the in-memory test double so the rule has exactly one place to
 * change.
 */
export function pickNewestOrigin<T extends OriginCandidate>(
  candidates: readonly T[],
): T | undefined {
  let winner: T | undefined;
  for (const candidate of candidates) {
    if (!winner || isNewerOrigin(candidate, winner)) winner = candidate;
  }
  return winner;
}

function isNewerOrigin(candidate: OriginCandidate, current: OriginCandidate): boolean {
  const candidateTime = candidate.createdAt.getTime();
  const currentTime = current.createdAt.getTime();
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  return candidate.id > current.id;
}
