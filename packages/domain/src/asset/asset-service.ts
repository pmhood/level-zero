import { createHash } from 'node:crypto';

import { type ActivityService } from '../activity/activity-service';
import { type JobService } from '../job/job-service';
import { type ProjectRepository } from '../project/project-repository';
import { type SearchIndexer } from '../search/search-indexer';
import { type Clock } from '../shared/clock';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { MAX_PAGE_SIZE, normalizePaging } from '../shared/paging';
import {
  archiveAsset,
  changeAssetPipelineStage,
  createAsset,
  restoreAsset,
  MAX_ASSET_UPLOAD_BYTES,
  type Asset,
  type AssetKind,
  type AssetPipelineStage,
  type AssetVariant,
} from './asset';
import { type AssetListFilter, type AssetPage, type AssetRepository } from './asset-repository';
import { ASSET_THUMBNAIL_JOB_STEPS } from './asset-thumbnail-job';
import { type ObjectStorageProvider } from './object-storage';

export interface AssetServiceDeps {
  clock: Clock;
  ids: IdGenerator;
}

export interface UploadAssetInput {
  kind: AssetKind;
  filename: string;
  mimeType: string;
  content: Buffer;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  variant?: AssetVariant;
  sourceAssetId?: string | null;
  createdBy?: string | null;
}

export interface AssetContent {
  asset: Asset;
  content: Buffer;
}

/**
 * Application service for assets.
 *
 * Composes the metadata repository with an `ObjectStorageProvider` so callers
 * never touch a storage key or an SDK directly. Every Workbench tool that
 * needs a file — Character Studio, Moodboard, the GDD — uploads and reads it
 * through this one service; linking it into the entity graph is done with
 * `EntityRelationshipService` and an `asset_reference` entity, not a
 * feature-specific table.
 */
export class AssetService {
  constructor(
    private readonly assets: AssetRepository,
    private readonly projects: ProjectRepository,
    private readonly storage: ObjectStorageProvider,
    private readonly activity: ActivityService,
    private readonly deps: AssetServiceDeps,
    private readonly search?: SearchIndexer,
    private readonly jobs?: JobService,
  ) {}

  /**
   * Stores `input.content` and records its metadata.
   *
   * The object is written to storage before the metadata row is inserted, so
   * a repository failure never leaves metadata pointing at nothing; if the
   * insert itself fails, the now-orphaned object is best-effort cleaned up.
   */
  async upload(projectId: string, input: UploadAssetInput): Promise<Asset> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    if (project.status === 'archived') {
      throw new ConflictError('Cannot add assets to an archived project', { projectId });
    }

    if (input.content.byteLength > MAX_ASSET_UPLOAD_BYTES) {
      throw new ValidationError(
        `File exceeds the ${MAX_ASSET_UPLOAD_BYTES / (1024 * 1024)}MB upload limit`,
        { field: 'content', maxBytes: MAX_ASSET_UPLOAD_BYTES, byteSize: input.content.byteLength },
      );
    }

    if (input.sourceAssetId) {
      const source = await this.assets.findById(projectId, input.sourceAssetId);
      if (!source) throw new NotFoundError('Asset', input.sourceAssetId);
    }

    const storageKey = buildStorageKey(projectId, this.deps.ids.next(), input.filename);
    await this.storage.put({
      key: storageKey,
      body: input.content,
      contentType: input.mimeType,
    });

    try {
      const asset = createAsset(
        {
          projectId,
          kind: input.kind,
          filename: input.filename,
          mimeType: input.mimeType,
          byteSize: input.content.byteLength,
          storageKey,
          checksum: sha256Hex(input.content),
          width: input.width,
          height: input.height,
          durationSeconds: input.durationSeconds,
          variant: input.variant,
          sourceAssetId: input.sourceAssetId,
          createdBy: input.createdBy,
        },
        this.deps,
      );
      const inserted = await this.assets.insert(asset);
      await this.requestThumbnail(inserted);
      return await this.indexed(inserted);
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  /** Throws `NotFoundError` rather than returning null: callers want the asset. */
  async getById(projectId: string, assetId: string): Promise<Asset> {
    const asset = await this.assets.findById(projectId, assetId);
    if (!asset) throw new NotFoundError('Asset', assetId);
    return asset;
  }

  async listByProject(projectId: string, filter: AssetListFilter = {}): Promise<AssetPage> {
    const { limit, offset } = normalizePaging(filter.limit, filter.offset);
    return this.assets.listByProject(projectId, { ...filter, limit, offset });
  }

  /** A URL safe to hand to a client, resolved through the configured storage provider. */
  async getUrl(
    projectId: string,
    assetId: string,
    options?: { expiresInSeconds?: number },
  ): Promise<string> {
    const asset = await this.getById(projectId, assetId);
    return this.storage.getUrl(asset.storageKey, options);
  }

  /** Fetches the asset's bytes back out of storage, for local development and tests. */
  async download(projectId: string, assetId: string): Promise<AssetContent> {
    const asset = await this.getById(projectId, assetId);
    const content = await this.storage.get(asset.storageKey);
    return { asset, content };
  }

  /** Archiving hides the asset from normal listings; its bytes are left in place. */
  async archive(projectId: string, assetId: string): Promise<Asset> {
    const asset = await this.getById(projectId, assetId);
    return this.indexed(await this.assets.save(archiveAsset(asset, this.deps)));
  }

  async restore(projectId: string, assetId: string): Promise<Asset> {
    const asset = await this.getById(projectId, assetId);
    return this.indexed(await this.assets.save(restoreAsset(asset, this.deps)));
  }

  /**
   * Moves an asset to a new pipeline stage (`docs/decisions/asset-library-model.md`
   * §6.3/§6.4): validates the stage, writes the column and records an
   * `asset_stage_changed` activity carrying `from`/`to`, so a production
   * stage change is a recorded act, not a bare column write. Any stage may
   * move to any other.
   */
  async setPipelineStage(
    projectId: string,
    assetId: string,
    stage: AssetPipelineStage,
    options: { actor?: string | null; note?: string } = {},
  ): Promise<Asset> {
    const asset = await this.getById(projectId, assetId);
    const from = asset.pipelineStage;
    const updated = await this.assets.save(changeAssetPipelineStage(asset, stage, this.deps));

    await this.activity.record({
      projectId,
      type: 'asset_stage_changed',
      summary: `${updated.filename} moved from ${from} to ${updated.pipelineStage}`,
      subjectType: 'asset',
      subjectId: updated.id,
      metadata: {
        from,
        to: updated.pipelineStage,
        ...(options.note ? { note: options.note } : {}),
      },
      actor: options.actor,
    });

    return this.indexed(updated);
  }

  /** Hands the saved asset to the search index, when one is wired up. */
  private async indexed(asset: Asset): Promise<Asset> {
    await this.search?.assetChanged(asset);
    return asset;
  }

  /**
   * Queues a thumbnail (and, where the source warrants it, a preview) for a
   * freshly uploaded image (#176) — never for a derivative, so a thumbnail
   * never gets a thumbnail of its own.
   *
   * Best-effort in the same sense as `indexed`: without a `JobService`, most
   * tests and any caller that does not care, this is a no-op.
   */
  private async requestThumbnail(asset: Asset): Promise<void> {
    if (!this.jobs || asset.variant !== 'source' || !asset.mimeType.startsWith('image/')) return;

    await this.jobs.enqueue(asset.projectId, {
      kind: 'thumbnail',
      targetId: asset.id,
      totalSteps: ASSET_THUMBNAIL_JOB_STEPS.length,
    });
  }

  /**
   * Queues a thumbnail for every existing source image asset in the project
   * that does not already have one — the one-off catch-up #176's acceptance
   * criteria asks for.
   *
   * Safe to run more than once: an asset that already has a thumbnail is
   * left alone, so a second pass only picks up what the first missed (a
   * project's later uploads, or a thumbnail job that failed for good).
   */
  async backfillThumbnails(projectId: string): Promise<number> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    if (!this.jobs) return 0;

    let queued = 0;
    for (let offset = 0; ; offset += MAX_PAGE_SIZE) {
      const { items } = await this.assets.listByProject(projectId, {
        variants: ['source'],
        includeArchived: true,
        limit: MAX_PAGE_SIZE,
        offset,
      });

      for (const asset of items) {
        if (!asset.mimeType.startsWith('image/')) continue;
        if (await this.hasThumbnail(projectId, asset.id)) continue;
        await this.requestThumbnail(asset);
        queued += 1;
      }

      if (items.length < MAX_PAGE_SIZE) return queued;
    }
  }

  private async hasThumbnail(projectId: string, sourceAssetId: string): Promise<boolean> {
    const { items } = await this.assets.listByProject(projectId, {
      sourceAssetId,
      variants: ['thumbnail'],
      includeArchived: true,
      limit: 1,
    });
    return items.length > 0;
  }
}

/** A filename made safe to use as a single path segment. */
function safeKeySegment(filename: string): string {
  return filename.replace(/[\\/]+/g, '_');
}

function buildStorageKey(projectId: string, objectId: string, filename: string): string {
  return `${projectId}/${objectId}/${safeKeySegment(filename)}`;
}

function sha256Hex(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}
