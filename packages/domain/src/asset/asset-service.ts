import { createHash } from 'node:crypto';

import { type ProjectRepository } from '../project/project-repository';
import { type SearchIndexer } from '../search/search-indexer';
import { type Clock } from '../shared/clock';
import { ConflictError, NotFoundError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { normalizePaging } from '../shared/paging';
import {
  archiveAsset,
  createAsset,
  restoreAsset,
  type Asset,
  type AssetKind,
  type AssetVariant,
} from './asset';
import { type AssetListFilter, type AssetPage, type AssetRepository } from './asset-repository';
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
    private readonly deps: AssetServiceDeps,
    private readonly search?: SearchIndexer,
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
      return await this.indexed(await this.assets.insert(asset));
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

  /** Hands the saved asset to the search index, when one is wired up. */
  private async indexed(asset: Asset): Promise<Asset> {
    await this.search?.assetChanged(asset);
    return asset;
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
