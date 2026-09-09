import { type Asset } from '../asset/asset';
import { type Entity } from '../entity/entity';
import { type Generation } from '../generation/generation';

/**
 * The hook a canonical record's service calls when that record changes.
 *
 * `EntityService`, `AssetService` and `GenerationService` take one of these
 * optionally, so the searchable copy follows the canonical row without any of
 * them learning what search is. `SearchIndexService` is the implementation; a
 * caller that does not want an index — most tests — passes nothing.
 */
export interface SearchIndexer {
  entityChanged(entity: Entity): Promise<void>;
  assetChanged(asset: Asset): Promise<void>;
  generationChanged(generation: Generation): Promise<void>;
}

/**
 * The steps a search-index job reports, in order, as a UI shows them.
 *
 * Both processes read this: the service sizes the job record from its length
 * when the work is queued, and the worker names each step as it reaches it.
 */
export const SEARCH_INDEX_JOB_STEPS = ['Indexing content', 'Building embeddings'] as const;
