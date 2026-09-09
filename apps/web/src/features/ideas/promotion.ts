import type { EntityType } from '@level-zero/domain';

export interface PromotionTarget {
  type: EntityType;
  label: string;
}

/**
 * The promotion targets issue #11 calls out. Promoting always creates a new
 * entity of `type` plus a `promoted_to` edge; the idea itself is untouched.
 */
export const IDEA_PROMOTION_TARGETS: readonly PromotionTarget[] = [
  { type: 'design_pillar', label: 'Turn into Design Pillar' },
  { type: 'mechanic', label: 'Turn into Mechanic' },
  { type: 'character', label: 'Turn into Character' },
  { type: 'location', label: 'Turn into Location' },
];
