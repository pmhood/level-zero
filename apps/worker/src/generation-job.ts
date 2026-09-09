import { isAiCapability, type AiCapability, type AiProviderRegistry } from '@level-zero/ai';
import { type JobDelivery } from '@level-zero/database';
import {
  GENERATION_JOB_STEPS,
  ValidationError,
  isDomainError,
  isJobActive,
  type FailJobInput,
  type Generation,
  type GenerationService,
  type Job,
  type JobService,
} from '@level-zero/domain';

import { type WorkerLogger } from './runtime';

const [PREPARING_STEP, GENERATING_STEP, STORING_STEP] = GENERATION_JOB_STEPS;

export interface GenerationJobDeps {
  jobs: JobService;
  generations: GenerationService;
  providers: AiProviderRegistry;
  logger: WorkerLogger;
}

/** Unwinds a job whose record was cancelled while it was running. */
class JobCancelled extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} was cancelled`);
    this.name = 'JobCancelled';
  }
}

/**
 * Runs one AI generation outside the request that asked for it.
 *
 * The handler moves the job through the steps a progress indicator shows —
 * preparing context, generating, storing the result — and moves the generation
 * record alongside it, so the API never holds a connection open for provider
 * work and a browser can watch either record.
 *
 * Throwing is how a failed attempt asks the queue for another one, so the
 * failure is recorded *before* the error is re-thrown. Cancellation is the
 * exception: it is checked between steps and unwinds without a retry, because a
 * cancelled job asked for no more attempts.
 */
export function createGenerationJobHandler(
  deps: GenerationJobDeps,
): (delivery: JobDelivery) => Promise<void> {
  return async (delivery: JobDelivery) => {
    const job = await deps.jobs.getById(delivery.projectId, delivery.jobId);
    // Cancelled between being queued and being picked up.
    if (!isJobActive(job)) return;

    try {
      await runGeneration(deps, job);
    } catch (error) {
      if (error instanceof JobCancelled) {
        deps.logger.log(`[worker] job ${job.id} stopped: cancelled`);
        return;
      }

      await recordFailure(deps, delivery, job.targetId, error);
      throw error;
    }
  };
}

async function runGeneration(deps: GenerationJobDeps, job: Job): Promise<void> {
  const { projectId, id: jobId } = job;
  const generation = await deps.generations.getById(projectId, job.targetId);
  const capability = requireCapability(generation);

  await deps.jobs.advance(projectId, jobId, {
    status: 'preparing_context',
    step: PREPARING_STEP,
  });
  const provenance = await deps.generations.provenance(projectId, generation.id);

  await requireNotCancelled(deps, projectId, jobId);
  await deps.jobs.advance(projectId, jobId, {
    status: 'running',
    completed: 1,
    step: GENERATING_STEP,
  });

  const provider = deps.providers.resolve(capability);
  // A second attempt re-enters a generation that was already dispatched.
  if (generation.status === 'queued') {
    await deps.generations.dispatch(projectId, generation.id, {
      provider: provider.id,
      model: requestedModel(generation) ?? provider.defaultModel,
    });
  }

  const result = await provider.execute({
    capability,
    prompt: generation.prompt,
    parameters: generation.parameters,
    context: {
      inputEntities: provenance.inputEntities,
      contextEntities: provenance.contextEntities,
      inputAssets: provenance.inputAssets,
    },
  });

  await requireNotCancelled(deps, projectId, jobId);
  await deps.jobs.advance(projectId, jobId, {
    status: 'processing',
    completed: 2,
    step: STORING_STEP,
  });

  // Output assets arrive with the vendor adapters (issue #8): completing with
  // none still closes the record and writes the lineage the request declared.
  await deps.generations.complete(projectId, generation.id, {
    outputAssetIds: [],
    providerRequestId: result.requestId ?? null,
  });

  await deps.jobs.advance(projectId, jobId, {
    status: 'complete',
    completed: GENERATION_JOB_STEPS.length,
    step: null,
  });
}

/**
 * Records a failed attempt on both records.
 *
 * A job the queue will run again stays failure-free on the generation, which is
 * still `running`: the next attempt continues it rather than starting a second
 * one.
 */
async function recordFailure(
  deps: GenerationJobDeps,
  delivery: JobDelivery,
  generationId: string,
  error: unknown,
): Promise<void> {
  const failure = toFailure(error);
  deps.logger.error(`[worker] job ${delivery.jobId} attempt ${delivery.attempt} failed`, error);

  if (delivery.willRetry) {
    await deps.jobs.retry(delivery.projectId, delivery.jobId, failure);
    return;
  }

  await deps.jobs.fail(delivery.projectId, delivery.jobId, failure);

  const generation = await deps.generations.getById(delivery.projectId, generationId);
  if (generation.status === 'queued' || generation.status === 'running') {
    await deps.generations.fail(delivery.projectId, generationId, failure);
  }
}

async function requireNotCancelled(
  deps: GenerationJobDeps,
  projectId: string,
  jobId: string,
): Promise<void> {
  const job = await deps.jobs.getById(projectId, jobId);
  if (job.status === 'cancelled') throw new JobCancelled(jobId);
}

/** The model the request named, when it named one. */
function requestedModel(generation: Generation): string | null {
  const model = generation.parameters.model;
  return typeof model === 'string' && model.trim().length > 0 ? model.trim() : null;
}

function requireCapability(generation: Generation): AiCapability {
  if (isAiCapability(generation.capability)) return generation.capability;

  throw new ValidationError(`No provider serves the capability "${generation.capability}"`, {
    generationId: generation.id,
    capability: generation.capability,
  });
}

function toFailure(error: unknown): FailJobInput {
  if (isDomainError(error)) {
    return { code: error.code, message: error.message, details: { ...error.details } };
  }

  return {
    code: 'provider_error',
    message: error instanceof Error ? error.message : String(error),
    details: {},
  };
}
