import { type JobDelivery } from '@level-zero/database';
import {
  CONSISTENCY_SCAN_JOB_STEPS,
  isDomainError,
  isJobActive,
  type ConsistencyScanService,
  type FailJobInput,
  type JobService,
} from '@level-zero/domain';

import { type WorkerLogger } from './runtime';

const [LOADING_STEP, DETERMINISTIC_STEP, AI_STEP] = CONSISTENCY_SCAN_JOB_STEPS;

export interface ConsistencyScanJobDeps {
  jobs: JobService;
  consistency: ConsistencyScanService;
  logger: WorkerLogger;
}

/**
 * Runs one project's consistency scan outside the request that asked for it
 * (docs/decisions/consistency-findings.md §8).
 *
 * The three named steps map onto job statuses the way `search-index-job.ts`
 * maps its two: `preparing_context` for the read-only pass that builds
 * `ProjectFacts`, `running` for the deterministic checks, and `processing`
 * reserved for the AI pass once a check of that type exists to run there —
 * nothing runs there yet, so the step advances straight through to
 * `complete`.
 *
 * Unlike `search-index-job.ts`'s handler for `SearchIndexService.record`,
 * there is no swallowed-error counterpart here to avoid copying: a
 * consistency scan is only ever queued by `ConsistencyScanService.requestScan`,
 * an explicit user request, so a failure below is left to propagate and fail
 * the job — never logged and hidden the way a side-effect reindex is.
 */
export function createConsistencyScanJobHandler(
  deps: ConsistencyScanJobDeps,
): (delivery: JobDelivery) => Promise<void> {
  return async (delivery: JobDelivery) => {
    const { projectId, jobId } = delivery;
    const job = await deps.jobs.getById(projectId, jobId);
    // Cancelled between being queued and being picked up.
    if (!isJobActive(job)) return;

    try {
      await deps.jobs.advance(projectId, jobId, { status: 'preparing_context', step: LOADING_STEP });
      const facts = await deps.consistency.loadProjectFacts(job.targetId);

      await deps.jobs.advance(projectId, jobId, {
        status: 'running',
        completed: 1,
        step: DETERMINISTIC_STEP,
      });
      // Committed before any AI pass begins: every deterministic finding is
      // upserted, and every open row the scan did not reproduce is closed,
      // by the time this call resolves.
      const produced = await deps.consistency.runDeterministicChecks(facts);

      await deps.jobs.advance(projectId, jobId, {
        status: 'processing',
        completed: 2,
        step: AI_STEP,
      });
      // No AI-assisted check is registered yet (§6.4, §7.6); the step is
      // reserved so a later pass can be added here without touching the
      // progress wiring.

      await deps.jobs.advance(projectId, jobId, {
        status: 'complete',
        completed: CONSISTENCY_SCAN_JOB_STEPS.length,
        step: null,
      });
      deps.logger.log(`[worker] consistency scan found ${produced} finding(s) in ${jobId}`);
    } catch (error) {
      await recordFailure(deps, delivery, error);
      // Throwing is how a failed attempt asks the queue for another one.
      throw error;
    }
  };
}

async function recordFailure(
  deps: ConsistencyScanJobDeps,
  delivery: JobDelivery,
  error: unknown,
): Promise<void> {
  const failure = toFailure(error);
  deps.logger.error(`[worker] job ${delivery.jobId} attempt ${delivery.attempt} failed`, error);

  if (delivery.willRetry) {
    await deps.jobs.retry(delivery.projectId, delivery.jobId, failure);
    return;
  }
  await deps.jobs.fail(delivery.projectId, delivery.jobId, failure);
}

function toFailure(error: unknown): FailJobInput {
  if (isDomainError(error)) {
    return { code: error.code, message: error.message, details: { ...error.details } };
  }

  return {
    code: 'consistency_scan_error',
    message: error instanceof Error ? error.message : String(error),
    details: {},
  };
}
