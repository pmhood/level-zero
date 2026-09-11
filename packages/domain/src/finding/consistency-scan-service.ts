import { type EntityRepository } from '../entity/entity-repository';
import { ACTIVE_JOB_STATUSES, type Job } from '../job/job';
import { type JobService } from '../job/job-service';
import { type PrototypeVersionRepository } from '../prototype/prototype-version-repository';
import { type Clock } from '../shared/clock';
import { type IdGenerator } from '../shared/id';
import { MAX_PAGE_SIZE } from '../shared/paging';
import { type AiCheckContext } from './ai-consistency-check';
import { AI_CONSISTENCY_CHECKS } from './ai-consistency-checks';
import { type ProjectFacts } from './consistency-check';
import { CONSISTENCY_CHECKS } from './consistency-checks';
import { createFinding, resolveFinding, type FindingOrigin } from './finding';
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
 * `running` for the deterministic checks, and `processing` for the AI pass
 * (§6.4), whose writes land after the deterministic ones have committed.
 */
export const CONSISTENCY_SCAN_JOB_STEPS = [
  'Loading project',
  'Deterministic checks',
  'AI analysis',
] as const;

/**
 * Runs a project's consistency scan: computes the finding set from scratch
 * and reconciles it against the project's existing rows.
 *
 * Two passes, run and reconciled separately, because the two kinds of check
 * are two types (§6.4). `runDeterministicChecks` needs nothing but facts and
 * always commits; `runAiChecks` needs a provider and may not. Each pass only
 * ever resolves rows of its own `origin`, which is what lets the AI pass fail
 * without last scan's AI findings being quietly closed by a scan that never
 * looked at them.
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

    await this.resolveStale(facts.projectId, 'deterministic', produced);
    return produced.size;
  }

  /**
   * Runs every registered AI-assisted check and reconciles the result against
   * the project's existing AI findings. Returns how many findings the pass
   * produced.
   *
   * `origin` and the judgement's `generationId` are set here, never by a
   * check: a check reports what it saw, and what kind of claim that is stays
   * the runner's to say (§6.4, §9). A check that had nothing to judge returns
   * no result and writes no generation.
   *
   * Nothing is swallowed. A provider that does not answer throws out of
   * `judge`, out of here and out of the job, leaving the deterministic
   * findings this scan already committed and no half-written AI ones — §8's
   * "the AI pass fails, `JobFailure` records why".
   */
  async runAiChecks(facts: ProjectFacts, ai: AiCheckContext): Promise<number> {
    const produced = new Set<string>();

    for (const check of AI_CONSISTENCY_CHECKS) {
      const result = await check.run(facts, ai);
      if (!result) continue;

      for (const checkFinding of result.findings) {
        produced.add(checkFinding.fingerprint);
        await this.findings.upsert(
          createFinding(
            {
              ...checkFinding,
              projectId: facts.projectId,
              checkId: check.id,
              origin: 'ai_assisted',
              generationId: result.generationId,
            },
            this.deps,
          ),
        );
      }
    }

    await this.resolveStale(facts.projectId, 'ai_assisted', produced);
    return produced.size;
  }

  /**
   * Closes every `open` finding of one origin that the pass did not just
   * reproduce. Reads the whole open set before writing any of it, so
   * resolving earlier rows can never shift which rows a later page of the
   * same read sees.
   *
   * Scoped to one origin because a pass only knows about its own kind: the
   * deterministic pass runs first and has not yet seen what the AI pass will
   * find, and the AI pass may never run at all.
   */
  private async resolveStale(
    projectId: string,
    origin: FindingOrigin,
    produced: ReadonlySet<string>,
  ): Promise<void> {
    const open = await this.pageAll((offset) =>
      this.findings.listByProject(projectId, { statuses: ['open'], limit: MAX_PAGE_SIZE, offset }),
    );

    for (const finding of open) {
      if (finding.origin !== origin) continue;
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
