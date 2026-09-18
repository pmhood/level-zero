import { type ConsistencyCheck } from './consistency-check';
import { duplicateNameCheck } from './duplicate-name-check';
import { stalePrototypePinCheck } from './stale-prototype-pin-check';
import { staleSectionReferenceCheck } from './stale-section-reference-check';

/**
 * Every deterministic check a scan runs, in the order their findings appear.
 *
 * A typed registry, not a rules DSL (#72, #88): adding a check is a file with
 * a pure function, a test with three literals, and one line here.
 */
export const CONSISTENCY_CHECKS: readonly ConsistencyCheck[] = [
  stalePrototypePinCheck,
  staleSectionReferenceCheck,
  duplicateNameCheck,
];
