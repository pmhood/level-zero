import { normalizePaging } from '../shared/paging';
import { type Asset, type AssetPipelineStage } from './asset';
import {
  type AssetLibraryFilter,
  type AssetLibraryPage,
  type AssetLibraryReadModel,
} from './asset-library-read-model';

/**
 * Application service for the asset library's read model.
 *
 * A thin wrapper over `AssetLibraryReadModel`, the same shape as
 * `AssetService` over `AssetRepository`: it exists so the controller depends
 * on a service, never a port, and so paging defaults are applied in one
 * place.
 */
export class AssetLibraryService {
  constructor(private readonly readModel: AssetLibraryReadModel) {}

  async list(projectId: string, filter: AssetLibraryFilter = {}): Promise<AssetLibraryPage> {
    const { limit, offset } = normalizePaging(filter.limit, filter.offset);
    return this.readModel.listByProject(projectId, { ...filter, limit, offset });
  }

  /** Active member counts for every collection in the project that has at least one. */
  async collectionCounts(projectId: string): Promise<Record<string, number>> {
    return this.readModel.countsByCollection(projectId);
  }

  /** The derived cover for every collection in the project that has at least one active member. */
  async collectionCovers(projectId: string): Promise<Record<string, Asset>> {
    return this.readModel.coversByCollection(projectId);
  }

  /** Active asset counts per pipeline stage across the whole project. */
  async stageCounts(projectId: string): Promise<Partial<Record<AssetPipelineStage, number>>> {
    return this.readModel.countsByStage(projectId);
  }
}
