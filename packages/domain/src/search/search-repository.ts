import { type EntityType } from '../entity/entity-type';
import { type SearchDocument, type SearchSourceType } from './search-document';

/**
 * What narrows a search, across every result type at once.
 *
 * The filters are deliberately the ones that mean something for a mixed
 * result list: an entity type only applies to entities, but a status, a tag or
 * a date range reads the same whether the row behind it is a character, an
 * asset or a generation.
 */
export interface SearchFilter {
  /** The words to match. Semantic search requires it; keyword search browses without it. */
  text?: string;
  sourceTypes?: readonly SearchSourceType[];
  /** Scopes to entity types — this is what a local, per-tool search sends. */
  entityTypes?: readonly EntityType[];
  /** Matches the source's own status (`draft`, `active`, `complete`, ...). */
  statuses?: readonly string[];
  /** Matches rows carrying *any* of these tags (case-insensitive). */
  tags?: readonly string[];
  updatedAfter?: Date;
  updatedBefore?: Date;
  /** Archived sources are hidden unless this is true or `statuses` asks for them. */
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * One hit, carrying enough to render it and to open what it came from.
 *
 * The stored body and the vector stay in the index: a result list needs a
 * preview and a pointer, not the whole record.
 */
export interface SearchResult {
  projectId: string;
  sourceType: SearchSourceType;
  sourceId: string;
  entityType: EntityType | null;
  status: string;
  tags: string[];
  title: string;
  excerpt: string;
  sourceVersionId: string | null;
  updatedAt: Date;
  /** Higher is better: a text rank for keyword search, cosine similarity for semantic. */
  score: number;
}

export interface SearchResultPage {
  items: SearchResult[];
  /** Total matching rows, ignoring `limit`/`offset`. */
  total: number;
}

/**
 * How close a vector has to be to count as a hit at all.
 *
 * Without a floor, "closest first" ranks *every* embedded row in the project,
 * so a question about nothing in particular still fills a result list and an
 * empty state can never be reached. Vectors are unit length, so the score is a
 * cosine: this admits a weak but real overlap and rejects the small non-zero
 * scores that hashing collisions produce between unrelated text.
 */
export const MIN_SEMANTIC_SIMILARITY = 0.05;

export interface SaveEmbeddingInput {
  embedding: readonly number[];
  model: string;
  /** The `contentHash` the vector was built from; a row that has moved on is left alone. */
  contentHash: string;
}

/**
 * Storage port for the search index.
 *
 * Every read is scoped by `projectId`, the same as every other repository here,
 * so a query can no more reach another project's material than a listing can.
 * There is no delete: canonical records are archived rather than removed, and
 * the project cascade is what finally clears these rows.
 */
export interface SearchDocumentRepository {
  /** Writes the searchable copy of one source, replacing whatever was there. */
  upsert(document: SearchDocument): Promise<SearchDocument>;
  /** Keyword search: full-text matching over the indexed text, ranked. */
  searchText(projectId: string, filter: SearchFilter): Promise<SearchResultPage>;
  /** Semantic search: the rows whose vector is closest to `embedding`. */
  searchSimilar(
    projectId: string,
    embedding: readonly number[],
    model: string,
    filter: SearchFilter,
  ): Promise<SearchResultPage>;
  /** Rows whose text has moved on from their vector, oldest first. */
  listStale(projectId: string, limit: number): Promise<SearchDocument[]>;
  saveEmbedding(projectId: string, documentId: string, input: SaveEmbeddingInput): Promise<void>;
}
