import { type EntityType } from '../entity/entity-type';

/**
 * One promotion the product offers: what it can be started from, what it makes,
 * and what the action is called.
 *
 * Data only. A definition never names the code that runs it — see
 * `docs/decisions/promotion-registry.md` §7 for the non-goals this protects.
 */
export interface PromotionDefinition {
  /** Source entity types this promotion is offered for. */
  sourceTypes: readonly EntityType[];
  /** What it creates. Always a new entity; the source is never converted. */
  targetType: EntityType;
  /** The action's label, e.g. "Turn into Mechanic". */
  label: string;
}

/**
 * The three promotion flows the product currently offers (§5.3). Adding a
 * fourth is a diff here, not a code change anywhere else.
 */
export const PROMOTIONS: readonly PromotionDefinition[] = [
  // Flow 1 — Idea → {Design Pillar, Mechanic, Character, Location}.
  { sourceTypes: ['idea'], targetType: 'design_pillar', label: 'Turn into Design Pillar' },
  { sourceTypes: ['idea'], targetType: 'mechanic', label: 'Turn into Mechanic' },
  { sourceTypes: ['idea'], targetType: 'character', label: 'Turn into Character' },
  { sourceTypes: ['idea'], targetType: 'location', label: 'Turn into Location' },

  // Flow 2 — Moodboard / reference → Visual Direction.
  {
    sourceTypes: ['asset_reference', 'moodboard'],
    targetType: 'design_pillar',
    label: 'Make this the visual direction',
  },

  // Flow 3 — Mechanic → Prototype.
  {
    sourceTypes: ['mechanic', 'system', 'scene'],
    targetType: 'prototype',
    label: 'Prototype this',
  },
];

/** The promotion offered for this pair, or `undefined` if the product does not offer one. */
export function findPromotion(
  sourceType: EntityType,
  targetType: EntityType,
): PromotionDefinition | undefined {
  return PROMOTIONS.find(
    (promotion) =>
      promotion.targetType === targetType && promotion.sourceTypes.includes(sourceType),
  );
}

/** Every promotion offered for a source type — the menu a workspace renders. */
export function promotionsFor(sourceType: EntityType): readonly PromotionDefinition[] {
  return PROMOTIONS.filter((promotion) => promotion.sourceTypes.includes(sourceType));
}
