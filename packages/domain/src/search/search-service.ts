import { ValidationError } from '../shared/errors';
import { normalizePaging } from '../shared/paging';
import { type EmbeddingProvider } from './embedding';
import {
  type SearchDocumentRepository,
  type SearchFilter,
  type SearchResultPage,
} from './search-repository';

/**
 * Reads the project's search index.
 *
 * Both ways of asking share one filter and one result shape, so a mixed list of
 * characters, GDD sections, assets and generations comes back the same however
 * the question was phrased — and so a page that scopes to its own entity type
 * is the same call with `entityTypes` set.
 *
 * Scoping is structural: every read carries `projectId`, so a query cannot see
 * another project's material any more than a listing can.
 */
export class SearchService {
  constructor(
    private readonly documents: SearchDocumentRepository,
    private readonly embeddings: EmbeddingProvider,
  ) {}

  /** Keyword search: ranked full-text matching, with the filters applied. */
  async search(projectId: string, filter: SearchFilter = {}): Promise<SearchResultPage> {
    const { limit, offset } = normalizePaging(filter.limit, filter.offset);
    return this.documents.searchText(projectId, { ...filter, limit, offset });
  }

  /**
   * Semantic search: the project material closest in meaning to the question.
   *
   * The question is embedded with the same provider that built the index, so
   * "the mechanic where oxygen limits exploration" can reach a mechanic that
   * never uses those words. Rows still waiting for a vector are simply not
   * candidates yet; keyword search already covers them.
   */
  async searchSemantic(projectId: string, filter: SearchFilter = {}): Promise<SearchResultPage> {
    const text = filter.text?.trim();
    if (!text) {
      throw new ValidationError('Semantic search needs something to search for', { field: 'text' });
    }

    const { limit, offset } = normalizePaging(filter.limit, filter.offset);
    const [embedding] = await this.embeddings.embed([text]);
    if (!embedding) {
      throw new ValidationError('The embedding provider returned no vector', { field: 'text' });
    }

    return this.documents.searchSimilar(projectId, embedding, this.embeddings.model, {
      ...filter,
      limit,
      offset,
    });
  }
}
