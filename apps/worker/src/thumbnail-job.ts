import { type JobDelivery } from '@level-zero/database';
import {
  ASSET_THUMBNAIL_JOB_STEPS,
  PREVIEW_MAX_DIMENSION,
  THUMBNAIL_MAX_DIMENSION,
  isDomainError,
  isJobActive,
  type Asset,
  type AssetService,
  type FailJobInput,
  type Job,
  type JobService,
} from '@level-zero/domain';
import sharp from 'sharp';

import { type WorkerLogger } from './runtime';

const [LOADING_STEP, DERIVING_STEP] = ASSET_THUMBNAIL_JOB_STEPS;

/**
 * Every generated derivative is re-encoded to this format regardless of the
 * source's own: one predictable output the grid always knows how to render,
 * and WebP keeps the alpha channel a PNG source (a sprite, a portrait with a
 * transparent background) relies on.
 */
const DERIVATIVE_MIME_TYPE = 'image/webp';
const DERIVATIVE_QUALITY = 82;

export interface ThumbnailJobDeps {
  jobs: JobService;
  assets: AssetService;
  logger: WorkerLogger;
}

/**
 * Generates a thumbnail, and a preview where downscaling actually helps, for
 * one source image — outside the request that uploaded or generated it,
 * because resizing is slow and can fail (CLAUDE.md: long-running work goes
 * through a `Job`).
 *
 * Both derivatives are ordinary `Asset` rows with `variant` and
 * `sourceAssetId` set, written through `AssetService.upload` exactly like any
 * other asset — which is also what keeps this from ever producing a
 * derivative of a derivative: `AssetService` only queues a thumbnail job for
 * a `source` upload.
 *
 * A failure here never touches the source asset: it stays usable, and the
 * failure is visible only on the job record, the same as `search-index-job`.
 */
export function createThumbnailJobHandler(
  deps: ThumbnailJobDeps,
): (delivery: JobDelivery) => Promise<void> {
  return async (delivery: JobDelivery) => {
    const { projectId, jobId } = delivery;
    const job = await deps.jobs.getById(projectId, jobId);
    // Cancelled between being queued and being picked up.
    if (!isJobActive(job)) return;

    try {
      await runThumbnailJob(deps, job);
    } catch (error) {
      await recordFailure(deps, delivery, error);
      // Throwing is how a failed attempt asks the queue for another one.
      throw error;
    }
  };
}

async function runThumbnailJob(deps: ThumbnailJobDeps, job: Job): Promise<void> {
  const { projectId, id: jobId, targetId: sourceAssetId } = job;

  await deps.jobs.advance(projectId, jobId, { status: 'running', step: LOADING_STEP });
  const { asset: source, content } = await deps.assets.download(projectId, sourceAssetId);

  await deps.jobs.advance(projectId, jobId, {
    status: 'processing',
    completed: 1,
    step: DERIVING_STEP,
  });

  const metadata = await sharp(content, { failOn: 'none' }).metadata();
  const longestEdge = Math.max(metadata.width ?? 0, metadata.height ?? 0);

  await uploadDerivative(deps, source, content, 'thumbnail', THUMBNAIL_MAX_DIMENSION);

  // A preview only earns its place when the source has more detail than the
  // thumbnail already keeps — otherwise it would be the same picture twice.
  if (longestEdge > THUMBNAIL_MAX_DIMENSION) {
    await uploadDerivative(deps, source, content, 'preview', PREVIEW_MAX_DIMENSION);
  }

  await deps.jobs.advance(projectId, jobId, {
    status: 'complete',
    completed: ASSET_THUMBNAIL_JOB_STEPS.length,
    step: null,
  });
}

async function uploadDerivative(
  deps: ThumbnailJobDeps,
  source: Asset,
  content: Buffer,
  variant: 'thumbnail' | 'preview',
  maxDimension: number,
): Promise<void> {
  const { data, info } = await sharp(content, { failOn: 'none' })
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: DERIVATIVE_QUALITY })
    .toBuffer({ resolveWithObject: true });

  await deps.assets.upload(source.projectId, {
    kind: 'image',
    filename: derivativeFilename(source.filename, variant),
    mimeType: DERIVATIVE_MIME_TYPE,
    content: data,
    width: info.width,
    height: info.height,
    variant,
    sourceAssetId: source.id,
    createdBy: source.createdBy,
  });
}

/** `kael-portrait.png` becomes `kael-portrait-thumbnail.webp`, `...-preview.webp`. */
function derivativeFilename(sourceFilename: string, variant: 'thumbnail' | 'preview'): string {
  const dot = sourceFilename.lastIndexOf('.');
  const base = dot > 0 ? sourceFilename.slice(0, dot) : sourceFilename;
  return `${base}-${variant}.webp`;
}

async function recordFailure(
  deps: ThumbnailJobDeps,
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
    code: 'thumbnail_error',
    message: error instanceof Error ? error.message : String(error),
    details: {},
  };
}
