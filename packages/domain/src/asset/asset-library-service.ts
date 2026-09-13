import { normalizePaging } from '../shared/paging';
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
}
