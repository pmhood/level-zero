import { createHash } from 'node:crypto';

import { type Entity } from '../entity/entity';
import { type PrototypeVersion } from '../prototype/prototype-version';
import { type ReviewDecision } from '../review/review-decision';
import { type CheckFinding } from './finding';

/**
 * One project's records, loaded once per scan and handed to every check.
 *
 * A check receives facts rather than repositories for three reasons: it makes
 * every check a pure function that a test can call with three hand-built
 * entities; it stops nine checks issuing nine passes over the same tables; and
 * it makes the project-scoping constraint structural — a check has no way to
 * reach a row it was not given.
 *
 * `EntityVersion` rows are deliberately absent: the stale-pin check compares a
 * pinned `entityVersionId` against `Entity.currentVersionId`, which is on the
 * entity. A later check that genuinely needs version history adds a field
 * then, with a real requirement behind it (§6.1).
 */
export interface ProjectFacts {
  projectId: string;
  /** Every entity in the project, archived included. Checks filter by `status` themselves. */
  entities: readonly Entity[];
  /** Every prototype version in the project, in no guaranteed order. */
  prototypeVersions: readonly PrototypeVersion[];
  /**
   * Every review decision anchored inside an entity — today, the ones recorded
   * against a GDD section, whose anchor is its heading's minted `sectionId`.
   * In no guaranteed order.
   *
   * Decisions about a whole entity are deliberately absent: they are pinned to
   * the version the reviewer read (`pinJudgement`), so they already go out of
   * date on their own and nothing here has to notice.
   */
  sectionDecisions: readonly ReviewDecision[];
}

/**
 * A deterministic check: named, registered, and provably not an AI call.
 *
 * `run` is synchronous and takes nothing but one project's facts — no
 * repository, no clock, no provider — which is what makes it impossible for
 * an implementation to reach a second project or make a model call. See
 * docs/decisions/consistency-findings.md §6.
 */
export interface ConsistencyCheck {
  /** Stable, kebab-case, and part of every fingerprint it mints. */
  id: string;
  /** Shown as the finding's category on the surface. */
  title: string;
  run(facts: ProjectFacts): CheckFinding[];
}

/**
 * Builds a fingerprint from a check's id and the canonical objects in
 * tension — never a value, a version id, a timestamp, a document position or
 * model-generated text (§4.2). The parts are hashed the way
 * `search-document.ts` already hashes indexed text: for length, not secrecy.
 */
export function fingerprint(checkId: string, ...parts: readonly string[]): string {
  return createHash('sha256')
    .update([checkId, ...parts].join('|'))
    .digest('hex');
}
