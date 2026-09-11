import { type AiConsistencyCheck } from './ai-consistency-check';
import { loreContradictionCheck } from './lore-contradiction-check';
import { nearDuplicateCheck } from './near-duplicate-check';

/**
 * Every AI-assisted check a scan runs, in the order their findings appear.
 *
 * A second registry rather than a flag on the first one, because the two
 * kinds of check are two types (§6.4): what a scan runs deterministically is
 * what is listed in `CONSISTENCY_CHECKS`, and nothing listed there can reach
 * a provider. Findings from here are always written with
 * `origin: 'ai_assisted'` and the generation that judged them.
 */
export const AI_CONSISTENCY_CHECKS: readonly AiConsistencyCheck[] = [
  loreContradictionCheck,
  nearDuplicateCheck,
];
