import { type JobDelivery } from '@level-zero/database';
import {
  SEARCH_INDEX_JOB_STEPS,
  isDomainError,
  isJobActive,
  type FailJobInput,
  type JobService,
  type SearchIndexService,
} from '@level-zero/domain';

import { type WorkerLogger } from './runtime';

const [INDEXING_STEP, EMBEDDING_STEP] = SEARCH_INDEX_JOB_STEPS;

/**
 * How many batches one job embeds before leaving the rest to the next one.
 *
 * A bound rather than "until nothing is stale": material edited while the job
 * runs is stale again the moment it is written, and a job that chased that
 * would never finish.
 */
const MAX_EMBEDDING_PASSES = 20;

export interface SearchIndexJobDeps {
  jobs: JobService;
  search: SearchIndexService;
  logger: WorkerLogger;
}

/**
 * Refreshes one project's search index outside the request that changed it.
 *
 * The text was already written where the change happened, so a keyword search
 * never waits for this. What happens here is the part that costs a provider
 * call: rebuilding the searchable copy from the canonical tables — which is
 * also how material that predates the index catches up — and then embedding
 * every row whose text has moved on from its vector.
 *
 * The job's target is the project, so many changes collapse into one pass
 * rather than queueing work per edit.
 */
export function createSearchIndexJobHandler(
  deps: SearchIndexJobDeps,
): (delivery: JobDelivery) => Promise<void> {
  return async (delivery: JobDelivery) => {
    const { projectId, jobId } = delivery;
    const job = await deps.jobs.getById(projectId, jobId);
    // Cancelled between being queued and being picked up.
    if (!isJobActive(job)) return;

    try {
      await deps.jobs.advance(projectId, jobId, { status: 'running', step: INDEXING_STEP });
      const indexed = await deps.search.reindexProject(job.targetId);

      await deps.jobs.advance(projectId, jobId, {
        status: 'processing',
        completed: 1,
        step: EMBEDDING_STEP,
      });

      let embedded = 0;
      for (let pass = 0; pass < MAX_EMBEDDING_PASSES; pass += 1) {
        const done = await deps.search.embedPending(job.targetId);
        if (done === 0) break;
        embedded += done;
      }

      await deps.jobs.advance(projectId, jobId, {
        status: 'complete',
        completed: SEARCH_INDEX_JOB_STEPS.length,
        step: null,
      });
      deps.logger.log(`[worker] indexed ${indexed} record(s), embedded ${embedded} in ${jobId}`);
    } catch (error) {
      await recordFailure(deps, delivery, error);
      // Throwing is how a failed attempt asks the queue for another one.
      throw error;
    }
  };
}

async function recordFailure(
  deps: SearchIndexJobDeps,
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
    code: 'search_index_error',
    message: error instanceof Error ? error.message : String(error),
    details: {},
  };
}
