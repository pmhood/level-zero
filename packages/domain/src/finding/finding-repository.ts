import { type Finding, type FindingStatus } from './finding';

export interface FindingListFilter {
  statuses?: readonly FindingStatus[];
  checkId?: string;
  limit?: number;
  offset?: number;
}

export interface FindingPage {
  items: Finding[];
  /** Total matching rows, ignoring `limit`/`offset`. */
  total: number;
}

/**
 * Storage port for findings.
 *
 * Every read is scoped by `projectId`, the same as every other repository
 * here: `ProjectFacts` already makes cross-project citation structurally
 * impossible for a check, and this is what makes it impossible for a query
 * too.
 *
 * `upsert` is how a scan writes: keyed on `(projectId, fingerprint)`, it
 * overwrites `checkId`, `origin`, `generationId`, `severity`, `summary`,
 * `evidence` and `lastSeenAt` wholesale, and leaves `status`, `firstSeenAt`,
 * `resolvedAt`, `dismissedAt`, `dismissedBy` and `dismissedReason` exactly as
 * an existing row had them — a check has no way to touch a user's dismissal,
 * or to rewrite when a finding was first seen
 * (docs/decisions/consistency-findings.md §3.2, §4.4, §10). `save` is for the
 * lifecycle fields themselves, such as recording a dismissal.
 */
export interface FindingRepository {
  upsert(finding: Finding): Promise<Finding>;
  findById(projectId: string, findingId: string): Promise<Finding | null>;
  listByProject(projectId: string, filter?: FindingListFilter): Promise<FindingPage>;
  /** Persists lifecycle changes — a dismissal, or a scan resolving a row. */
  save(finding: Finding): Promise<Finding>;
}
