import {
  isAiCapability,
  readResolvedContext,
  type AiArtifact,
  type AiCapability,
  type AiProviderRegistry,
  type AiReferenceImage,
  type AiResult,
} from '@level-zero/ai';
import { type JobDelivery } from '@level-zero/database';
import {
  GENERATION_JOB_STEPS,
  NotFoundError,
  ValidationError,
  isDomainError,
  isJobActive,
  type AssetService,
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
  assets: AssetService;
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
 * Whatever a provider returns is stored as an ordinary project `Asset`: text as
 * `text/plain`, files as themselves. Nothing here knows which vendor answered,
 * and no provider URL is ever recorded.
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
  // Assembled when the request was recorded, so it describes the project as it
  // was when the user asked rather than whenever the queue got here.
  const context = readResolvedContext(generation.resolvedContext);

  await requireNotCancelled(deps, projectId, jobId);
  await deps.jobs.advance(projectId, jobId, {
    status: 'running',
    completed: 1,
    step: GENERATING_STEP,
  });

  // Preference order: the first candidate to support the capability wins, and
  // later ones stand by as fallbacks if it fails.
  const candidates = deps.providers.candidatesFor(capability);
  const firstChoice = candidates[0];
  if (!firstChoice) {
    throw new NotFoundError('AI provider for capability', capability);
  }

  // A second attempt re-enters a generation that was already dispatched.
  if (generation.status === 'queued') {
    await deps.generations.dispatch(projectId, generation.id, {
      provider: firstChoice.id,
      model: requestedModel(generation) ?? firstChoice.defaultModel,
    });
  }

  const result = await deps.providers.execute({
    capability,
    prompt: generation.prompt,
    parameters: generation.parameters,
    context,
    references: await loadReferences(deps, generation),
  });

  // `execute` may have fallen through to a later candidate; correct the
  // record so it never names a provider that did not produce the result.
  const actual = candidates.find((candidate) => candidate.id === result.providerId) ?? firstChoice;
  if (actual.id !== firstChoice.id) {
    await deps.generations.redispatch(projectId, generation.id, {
      provider: actual.id,
      model: requestedModel(generation) ?? actual.defaultModel,
    });
  }

  await requireNotCancelled(deps, projectId, jobId);
  await deps.jobs.advance(projectId, jobId, {
    status: 'processing',
    completed: 2,
    step: STORING_STEP,
  });

  await deps.generations.complete(projectId, generation.id, {
    outputAssetIds: await storeOutputs(deps, generation, result),
    providerRequestId: result.requestId ?? null,
  });

  await deps.jobs.advance(projectId, jobId, {
    status: 'complete',
    completed: GENERATION_JOB_STEPS.length,
    step: null,
  });
}

/**
 * Reads the bytes of the images the request works from.
 *
 * The generation record names its input assets; an editing or variation model
 * needs the pixels behind them, which no stored context snapshot can carry.
 * Only images are read: a reference is something a picture is made from, and
 * streaming an unrelated build artifact into memory to hand a model would be a
 * cost with no purpose.
 */
async function loadReferences(
  deps: GenerationJobDeps,
  generation: Generation,
): Promise<AiReferenceImage[]> {
  const references: AiReferenceImage[] = [];

  for (const assetId of generation.inputAssetIds) {
    // Metadata first, so a non-image is skipped without reading its bytes.
    const asset = await deps.assets.getById(generation.projectId, assetId);
    if (asset.kind !== 'image') continue;

    const { content } = await deps.assets.download(generation.projectId, assetId);
    references.push({
      assetId: asset.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      content,
    });
  }

  return references;
}

/**
 * Uploads everything the provider produced and returns the asset ids.
 *
 * Text is an asset too: it makes one rule for every capability, and it means a
 * feature reads a generated GDD section back exactly the way it reads a
 * generated portrait.
 */
async function storeOutputs(
  deps: GenerationJobDeps,
  generation: Generation,
  result: AiResult,
): Promise<string[]> {
  const artifacts: AiArtifact[] = [
    ...(result.output
      ? [
          {
            kind: 'export' as const,
            filename: `${generation.id}.txt`,
            mimeType: 'text/plain',
            content: Buffer.from(result.output, 'utf8'),
          },
        ]
      : []),
    ...(result.artifacts ?? []),
  ];

  const stored: string[] = [];
  for (const artifact of artifacts) {
    const asset = await deps.assets.upload(generation.projectId, {
      ...artifact,
      createdBy: generation.createdBy,
    });
    stored.push(asset.id);
  }
  return stored;
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
