import { type Asset } from '../asset/asset';
import { type AssetRepository } from '../asset/asset-repository';
import { type Entity } from '../entity/entity';
import { type EntityRepository } from '../entity/entity-repository';
import { type Generation } from '../generation/generation';
import { type GenerationRepository } from '../generation/generation-repository';
import { ACTIVE_JOB_STATUSES, type Job } from '../job/job';
import { type JobService } from '../job/job-service';
import { type Clock } from '../shared/clock';
import { type IdGenerator } from '../shared/id';
import { MAX_PAGE_SIZE } from '../shared/paging';
import { type EmbeddingProvider } from './embedding';
import {
  embeddableText,
  searchDocumentForAsset,
  searchDocumentForEntity,
  searchDocumentForGeneration,
  type SearchDocument,
} from './search-document';
import { SEARCH_INDEX_JOB_STEPS, type SearchIndexer } from './search-indexer';
import { type SearchDocumentRepository } from './search-repository';

export interface SearchIndexServiceDeps {
  clock: Clock;
  ids: IdGenerator;
}

/** How many rows one pass of `embedPending` asks a provider for. */
export const EMBEDDING_BATCH_SIZE = 50;

/**
 * Keeps the search index following the project's canonical records.
 *
 * Indexing is split in two because the halves cost different things. The text
 * is written the moment a record changes — one statement, in the same request —
 * so a rename or an autosaved paragraph is findable immediately. The vector is
 * not: building one is a provider call, so a change only marks the row stale
 * and makes sure a `search_index` job is queued, and `apps/worker` does the
 * embedding where every other long-running call already happens.
 *
 * `reindexProject` rebuilds the whole index from the canonical tables, which is
 * what the same job runs first — it is how material that predates the index,
 * or that changed while nothing was listening, catches up.
 */
export class SearchIndexService implements SearchIndexer {
  constructor(
    private readonly documents: SearchDocumentRepository,
    private readonly entities: EntityRepository,
    private readonly assets: AssetRepository,
    private readonly generations: GenerationRepository,
    private readonly embeddings: EmbeddingProvider,
    private readonly jobs: JobService,
    private readonly deps: SearchIndexServiceDeps,
  ) {}

  async entityChanged(entity: Entity): Promise<void> {
    await this.record(searchDocumentForEntity(entity, this.deps));
  }

  async assetChanged(asset: Asset): Promise<void> {
    await this.record(searchDocumentForAsset(asset, this.deps));
  }

  async generationChanged(generation: Generation): Promise<void> {
    await this.record(searchDocumentForGeneration(generation, this.deps));
  }

  /**
   * Queues a full pass over the project, or returns the pass already queued.
   *
   * Two writes racing can still enqueue two jobs; the second finds nothing
   * stale and completes, which is cheaper than serialising every write.
   */
  async requestReindex(projectId: string): Promise<Job> {
    const { items } = await this.jobs.listByProject(projectId, {
      kind: 'search_index',
      targetId: projectId,
      statuses: ACTIVE_JOB_STATUSES,
      limit: 1,
    });

    return (
      items[0] ??
      this.jobs.enqueue(projectId, {
        kind: 'search_index',
        targetId: projectId,
        totalSteps: SEARCH_INDEX_JOB_STEPS.length,
      })
    );
  }

  /** Rewrites the searchable copy of every record in the project. Returns how many. */
  async reindexProject(projectId: string): Promise<number> {
    const counts = await Promise.all([
      this.indexAll(
        (offset) =>
          this.entities.listByProject(projectId, {
            includeArchived: true,
            limit: MAX_PAGE_SIZE,
            offset,
          }),
        (entity) => searchDocumentForEntity(entity, this.deps),
      ),
      this.indexAll(
        (offset) =>
          this.assets.listByProject(projectId, {
            includeArchived: true,
            limit: MAX_PAGE_SIZE,
            offset,
          }),
        (asset) => searchDocumentForAsset(asset, this.deps),
      ),
      this.indexAll(
        (offset) => this.generations.listByProject(projectId, { limit: MAX_PAGE_SIZE, offset }),
        (generation) => searchDocumentForGeneration(generation, this.deps),
      ),
    ]);

    return counts.reduce((total, count) => total + count, 0);
  }

  /**
   * Builds vectors for the rows whose text has moved on from theirs.
   *
   * One batch per call so the worker can report progress and stop between
   * them; the caller repeats until it returns zero.
   */
  async embedPending(projectId: string, limit = EMBEDDING_BATCH_SIZE): Promise<number> {
    const stale = await this.documents.listStale(projectId, limit);
    if (stale.length === 0) return 0;

    const vectors = await this.embeddings.embed(stale.map(embeddableText));

    let embedded = 0;
    for (const [index, document] of stale.entries()) {
      const embedding = vectors[index];
      if (!embedding) continue;

      await this.documents.saveEmbedding(projectId, document.id, {
        embedding,
        model: this.embeddings.model,
        contentHash: document.contentHash,
      });
      embedded += 1;
    }
    return embedded;
  }

  /**
   * Writes the searchable copy and asks for a vector pass — without ever
   * failing the write that triggered it.
   *
   * By the time this runs the canonical row is already saved, so throwing
   * would report a failure for something that happened. It would also make
   * every entity write depend on Redis, which queues the job: a broken queue
   * would turn creating an idea or autosaving a GDD into an error. The index
   * is derived and self-healing — every `search_index` job rebuilds it from
   * the canonical tables, and `POST …/search/reindex` forces a pass — so a
   * failure here costs a delay, never data.
   *
   * Some of these are ordinary: an archived project runs no background work,
   * so queueing a pass for one is refused, and that is correct rather than
   * exceptional. They are logged the same way regardless, because the caller
   * has nothing to do about any of them.
   */
  private async record(document: SearchDocument): Promise<void> {
    try {
      await this.documents.upsert(document);
      await this.requestReindex(document.projectId);
    } catch (error) {
      console.error(`[search] could not index ${document.sourceType} ${document.sourceId}`, error);
    }
  }

  /** Walks one project-scoped listing page by page, indexing every record. */
  private async indexAll<T>(
    read: (offset: number) => Promise<{ items: T[] }>,
    toDocument: (record: T) => SearchDocument,
  ): Promise<number> {
    let indexed = 0;

    for (let offset = 0; ; offset += MAX_PAGE_SIZE) {
      const { items } = await read(offset);
      for (const record of items) {
        await this.documents.upsert(toDocument(record));
        indexed += 1;
      }
      if (items.length < MAX_PAGE_SIZE) return indexed;
    }
  }
}
