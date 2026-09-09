import {
  MIN_SEMANTIC_SIMILARITY,
  SEARCH_EXCERPT_LENGTH,
  ValidationError,
  type SaveEmbeddingInput,
  type SearchDocument,
  type SearchDocumentRepository,
  type SearchFilter,
  type SearchResult,
  type SearchResultPage,
} from '@level-zero/domain';
import { and, asc, count, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import { searchDocuments } from '../schema/search-documents';
import { toSearchDocument, toSearchDocumentRow } from './mappers';

/**
 * Postgres adapter for the domain's `SearchDocumentRepository` port.
 *
 * Both ways of asking run through the same `where` builder, so a filter means
 * the same thing whether the question was words or a vector — and, like every
 * other adapter here, every statement carries `project_id`, so a query cannot
 * reach another project's material at all.
 *
 * Keyword matching uses the generated `search_vector` column and
 * `websearch_to_tsquery`, which accepts what people already type into a search
 * box: bare words, `"quoted phrases"`, `or`, and `-excluded`.
 */
export class DrizzleSearchDocumentRepository implements SearchDocumentRepository {
  constructor(private readonly db: Database) {}

  async upsert(document: SearchDocument): Promise<SearchDocument> {
    const row = toSearchDocumentRow(document);

    const [saved] = await this.db
      .insert(searchDocuments)
      .values(row)
      .onConflictDoUpdate({
        target: [searchDocuments.sourceType, searchDocuments.sourceId],
        // The embedding columns are deliberately absent: re-indexing replaces
        // the text and lets the hashes report the vector as stale, rather than
        // throwing away a vector that may still be correct.
        set: {
          projectId: row.projectId,
          entityType: row.entityType,
          status: row.status,
          tags: row.tags,
          title: row.title,
          body: row.body,
          contentHash: row.contentHash,
          sourceVersionId: row.sourceVersionId,
          sourceUpdatedAt: row.sourceUpdatedAt,
          indexedAt: row.indexedAt,
        },
      })
      .returning();

    if (!saved) throw new Error('Upsert returned no search document row');
    return toSearchDocument(saved);
  }

  async searchText(projectId: string, filter: SearchFilter): Promise<SearchResultPage> {
    const text = filter.text?.trim();
    if (!text) {
      // Nothing to rank by, so this is a browse: newest material first.
      return this.page(buildWhere(projectId, filter), sql`0`, filter, [
        desc(searchDocuments.sourceUpdatedAt),
      ]);
    }

    const query = sql`websearch_to_tsquery('english', ${text})`;
    const where = and(
      buildWhere(projectId, filter),
      sql`${searchDocuments.searchVector} @@ ${query}`,
    ) as SQL;
    const score = sql<number>`ts_rank_cd(${searchDocuments.searchVector}, ${query})`;

    return this.page(where, score, filter);
  }

  async searchSimilar(
    projectId: string,
    embedding: readonly number[],
    model: string,
    filter: SearchFilter,
  ): Promise<SearchResultPage> {
    const vector = toVectorLiteral(embedding);

    // Every stored vector is unit length, so cosine similarity is the dot
    // product — which stock Postgres can do over two arrays without pgvector.
    const score = sql<number>`(
      select coalesce(sum(stored * asked), 0)
      from unnest(${searchDocuments.embedding}, ${vector}) as pair(stored, asked)
    )`;

    const where = and(
      buildWhere(projectId, filter),
      eq(searchDocuments.embeddingModel, model),
      // A row embedded at another width is not in this vector space either.
      sql`array_length(${searchDocuments.embedding}, 1) = ${embedding.length}`,
      // Ranking alone would return the whole project; a hit has to be a hit.
      sql`${score} >= ${MIN_SEMANTIC_SIMILARITY}`,
    ) as SQL;

    return this.page(where, score, filter);
  }

  async listStale(projectId: string, limit: number): Promise<SearchDocument[]> {
    const rows = await this.db
      .select()
      .from(searchDocuments)
      .where(
        and(
          eq(searchDocuments.projectId, projectId),
          sql`${searchDocuments.embeddedHash} is distinct from ${searchDocuments.contentHash}`,
        ),
      )
      .orderBy(asc(searchDocuments.indexedAt), asc(searchDocuments.id))
      .limit(limit);

    return rows.map(toSearchDocument);
  }

  async saveEmbedding(
    projectId: string,
    documentId: string,
    input: SaveEmbeddingInput,
  ): Promise<void> {
    await this.db
      .update(searchDocuments)
      .set({
        embedding: [...input.embedding],
        embeddingModel: input.model,
        embeddedHash: input.contentHash,
      })
      .where(
        and(
          eq(searchDocuments.id, documentId),
          eq(searchDocuments.projectId, projectId),
          // The row may have been re-indexed while the vector was being built;
          // only the text that was actually embedded gets it.
          eq(searchDocuments.contentHash, input.contentHash),
        ),
      );
  }

  /** Runs one ranked, filtered page plus its total, and projects the results. */
  private async page(
    where: SQL,
    score: SQL<number>,
    filter: SearchFilter,
    order: SQL[] = [],
  ): Promise<SearchResultPage> {
    const [rows, [totals]] = await Promise.all([
      this.db
        .select({
          projectId: searchDocuments.projectId,
          sourceType: searchDocuments.sourceType,
          sourceId: searchDocuments.sourceId,
          entityType: searchDocuments.entityType,
          status: searchDocuments.status,
          tags: searchDocuments.tags,
          title: searchDocuments.title,
          // The stored body can be long and the vector is never a caller's
          // business, so a result carries a preview and a pointer.
          excerpt: sql<string>`left(${searchDocuments.body}, ${SEARCH_EXCERPT_LENGTH})`,
          sourceVersionId: searchDocuments.sourceVersionId,
          updatedAt: searchDocuments.sourceUpdatedAt,
          score,
        })
        .from(searchDocuments)
        .where(where)
        .orderBy(
          ...(order.length > 0 ? order : [desc(score), desc(searchDocuments.sourceUpdatedAt)]),
          desc(searchDocuments.id),
        )
        .limit(filter.limit ?? 50)
        .offset(filter.offset ?? 0),
      this.db.select({ value: count() }).from(searchDocuments).where(where),
    ]);

    return {
      items: rows.map((row): SearchResult => ({ ...row, score: Number(row.score) })),
      total: totals?.value ?? 0,
    };
  }
}

function buildWhere(projectId: string, filter: SearchFilter): SQL {
  const conditions: SQL[] = [eq(searchDocuments.projectId, projectId)];

  if (filter.statuses?.length) {
    conditions.push(inArray(searchDocuments.status, [...filter.statuses]));
  } else if (filter.includeArchived !== true) {
    // Archived material is kept, not deleted, so it is hidden by default.
    conditions.push(sql`${searchDocuments.status} <> 'archived'`);
  }

  if (filter.sourceTypes?.length) {
    conditions.push(inArray(searchDocuments.sourceType, [...filter.sourceTypes]));
  }
  if (filter.entityTypes?.length) {
    conditions.push(inArray(searchDocuments.entityType, [...filter.entityTypes]));
  }

  const tags = filter.tags?.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0);
  if (tags?.length) {
    // Tags keep the casing the user typed, so matching lowercases both sides.
    const wanted = sql.join(
      tags.map((tag) => sql`${tag}`),
      sql`, `,
    );
    conditions.push(
      sql`exists (select 1 from unnest(${searchDocuments.tags}) as tag where lower(tag) in (${wanted}))`,
    );
  }

  if (filter.updatedAfter) {
    conditions.push(gte(searchDocuments.sourceUpdatedAt, filter.updatedAfter));
  }
  if (filter.updatedBefore) {
    conditions.push(lte(searchDocuments.sourceUpdatedAt, filter.updatedBefore));
  }

  return and(...conditions) as SQL;
}

/**
 * Renders a vector as a Postgres array literal.
 *
 * Written into the statement rather than bound, because the driver has no type
 * for a float array here. Every element is checked to be a finite number first,
 * which is what makes that safe.
 */
function toVectorLiteral(embedding: readonly number[]): SQL {
  if (embedding.length === 0) {
    throw new ValidationError('A semantic search needs a non-empty vector', { field: 'embedding' });
  }
  for (const value of embedding) {
    if (!Number.isFinite(value)) {
      throw new ValidationError('An embedding must contain only finite numbers', {
        field: 'embedding',
        received: value,
      });
    }
  }

  return sql.raw(`'{${embedding.join(',')}}'::double precision[]`);
}
