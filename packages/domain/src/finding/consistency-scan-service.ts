import { type EntityRepository } from '../entity/entity-repository';
import { ACTIVE_JOB_STATUSES, type Job } from '../job/job';
import { type JobService } from '../job/job-service';
import { type PrototypeVersionRepository } from '../prototype/prototype-version-repository';
import { type Clock } from '../shared/clock';
import { type IdGenerator } from '../shared/id';
import { MAX_PAGE_SIZE } from '../shared/paging';
import { type ProjectFacts } from './consistency-check';
import { CONSISTENCY_CHECKS } from './consistency-checks';
import { createFinding, resolveFinding } from './finding';
import { type FindingRepository } from './finding-repository';

export interface ConsistencyScanServiceDeps {
  clock: Clock;
  ids: IdGenerator;
}

/**
 * The steps a consistency-scan job reports, in order, as a UI shows them
 * (docs/decisions/consistency-findings.md §8).
 *
 * Mapped onto job statuses the way `search-index-job.ts` maps its two steps:
 * `preparing_context` for the read-only pass that builds `ProjectFacts`,
 * `running` for the deterministic checks, and `processing` reserved for the
 * AI pass once a check of that type (§6.4) exists to run there.
 */
export const CONSISTENCY_SCAN_JOB_STEPS = [
  'Loading project',
  'Deterministic checks',
  'AI analysis',
] as const;

/**
 * Runs a project's consistency scan: computes the deterministic finding set
 * from scratch and reconciles it against the project's existing rows.
 *
 * On demand only, deduplicated exactly like
 * `SearchIndexService.requestReindex` (§8) — a scan is a project-wide read
 * plus a batch of upserts, not something a request-time write should
 * trigger. Unlike `SearchIndexService.record`, nothing here swallows a
 * failure: a scan is the user's explicit "Run analysis" request, not a side
 * effect of an unrelated write, so a broken pass must fail its job rather
 * than quietly produce nothing.
 */
export class ConsistencyScanService {
  constructor(
    private readonly entities: EntityRepository,
    private readonly prototypeVersions: PrototypeVersionRepository,
    private readonly findings: FindingRepository,
    private readonly jobs: JobService,
    private readonly deps: ConsistencyScanServiceDeps,
  ) {}

  /**
   * Queues a scan, or returns the one already queued.
   *
   * Two requests racing can still enqueue two jobs; the second finds the same
   * findings the first already wrote, which is cheaper than serialising.
   */
  async requestScan(projectId: string): Promise<Job> {
    const { items } = await this.jobs.listByProject(projectId, {
      kind: 'consistency_scan',
      targetId: projectId,
      statuses: ACTIVE_JOB_STATUSES,
      limit: 1,
    });

    return (
      items[0] ??
      this.jobs.enqueue(projectId, {
        kind: 'consistency_scan',
        targetId: projectId,
        totalSteps: CONSISTENCY_SCAN_JOB_STEPS.length,
      })
    );
  }

  /** Loads one project's records for the registered checks to run against. */
  async loadProjectFacts(projectId: string): Promise<ProjectFacts> {
    const [entities, prototypeVersions] = await Promise.all([
      this.pageAll((offset) =>
        this.entities.listByProject(projectId, {
          includeArchived: true,
          limit: MAX_PAGE_SIZE,
          offset,
        }),
      ),
      this.pageAll((offset) =>
        this.prototypeVersions.listByProject(projectId, { limit: MAX_PAGE_SIZE, offset }),
      ),
    ]);

    return { projectId, entities, prototypeVersions };
  }

  /**
   * Runs every registered deterministic check and reconciles the result
   * against the project's existing findings. Returns how many findings the
   * scan produced.
   *
   * This is the write §8 requires to land before any AI pass begins: by the
   * time it resolves, every deterministic finding is upserted and every
   * `open` row the scan did not reproduce is closed.
   */
  async runDeterministicChecks(facts: ProjectFacts): Promise<number> {
    const produced = new Set<string>();

    for (const check of CONSISTENCY_CHECKS) {
      for (const checkFinding of check.run(facts)) {
        produced.add(checkFinding.fingerprint);
        await this.findings.upsert(
          createFinding(
            {
              ...checkFinding,
              projectId: facts.projectId,
              checkId: check.id,
              origin: 'deterministic',
            },
            this.deps,
          ),
        );
      }
    }

    await this.resolveStale(facts.projectId, produced);
    return produced.size;
  }

  /**
   * Closes every `open` finding the scan did not just reproduce. Reads the
   * whole open set before writing any of it, so resolving earlier rows can
   * never shift which rows a later page of the same read sees.
   */
  private async resolveStale(projectId: string, produced: ReadonlySet<string>): Promise<void> {
    const open = await this.pageAll((offset) =>
      this.findings.listByProject(projectId, { statuses: ['open'], limit: MAX_PAGE_SIZE, offset }),
    );

    for (const finding of open) {
      if (produced.has(finding.fingerprint)) continue;
      await this.findings.save(resolveFinding(finding, this.deps));
    }
  }

  private async pageAll<T>(read: (offset: number) => Promise<{ items: T[] }>): Promise<T[]> {
    const all: T[] = [];
    for (let offset = 0; ; offset += MAX_PAGE_SIZE) {
      const { items } = await read(offset);
      all.push(...items);
      if (items.length < MAX_PAGE_SIZE) return all;
    }
  }
}
