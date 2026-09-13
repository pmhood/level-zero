import { type Clock } from '../shared/clock';
import { NotFoundError } from '../shared/errors';
import { normalizePaging } from '../shared/paging';
import { dismissFinding, reopenFinding, type DismissFindingInput, type Finding } from './finding';
import {
  type FindingListFilter,
  type FindingPage,
  type FindingRepository,
} from './finding-repository';

export interface FindingServiceDeps {
  clock: Clock;
}

/**
 * Reads the Consistency surface's findings and carries out the two things a
 * person may do to one: dismiss it, and undo that dismissal.
 *
 * There is no `resolve` method here on purpose. §5 of
 * docs/decisions/consistency-findings.md is explicit that resolving a finding
 * means fixing the thing a scan is watching, not pressing a button — a
 * "resolve" action that did not change the underlying objects would put this
 * surface back in the business of lying. `ConsistencyScanService` is the only
 * writer of that transition.
 */
export class FindingService {
  constructor(
    private readonly findings: FindingRepository,
    private readonly deps: FindingServiceDeps,
  ) {}

  /** The project's findings, newest-seen first. */
  async listByProject(projectId: string, filter: FindingListFilter = {}): Promise<FindingPage> {
    const { limit, offset } = normalizePaging(filter.limit, filter.offset);
    return this.findings.listByProject(projectId, { ...filter, limit, offset });
  }

  /** Throws `NotFoundError` rather than returning null: callers want the record. */
  async getById(projectId: string, findingId: string): Promise<Finding> {
    const finding = await this.findings.findById(projectId, findingId);
    if (!finding) throw new NotFoundError('Finding', findingId);
    return finding;
  }

  /**
   * Records that a finding is a known, accepted state rather than a problem.
   * The row survives — dismissal is a status, never a deletion — and a scan
   * that reproduces the same fingerprint later leaves this alone (§3.2, §4.4).
   */
  async dismiss(
    projectId: string,
    findingId: string,
    input: DismissFindingInput,
  ): Promise<Finding> {
    const finding = await this.getById(projectId, findingId);
    return this.findings.save(dismissFinding(finding, input, this.deps));
  }

  /** Undoes a dismissal — the "one click" undo §4.4 promises. */
  async reopen(projectId: string, findingId: string): Promise<Finding> {
    const finding = await this.getById(projectId, findingId);
    return this.findings.save(reopenFinding(finding));
  }
}
