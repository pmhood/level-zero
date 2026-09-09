import {
  SearchIndexService,
  SearchService,
  type Job,
  type SearchFilter,
  type SearchResultPage,
} from '@level-zero/domain';
import { Controller, Get, Param, Post, Query } from '@nestjs/common';

import { SearchQueryDto } from './dto/search.dto';

/**
 * One way in to everything in a project.
 *
 * The same endpoint answers a global search and a tool's local one: a page that
 * only cares about mechanics sends `entityType=mechanic`, and a global search
 * sends nothing. `mode=semantic` asks the same question of the embeddings
 * instead of the words, and hands back the same result shape, so a UI can offer
 * both without a second integration.
 *
 * Results are project-scoped by the path, like every other endpoint here.
 */
@Controller('projects/:projectId/search')
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly index: SearchIndexService,
  ) {}

  @Get()
  find(
    @Param('projectId') projectId: string,
    @Query() query: SearchQueryDto,
  ): Promise<SearchResultPage> {
    const filter = toFilter(query);

    return query.mode === 'semantic'
      ? this.search.searchSemantic(projectId, filter)
      : this.search.search(projectId, filter);
  }

  /**
   * Rebuilds the project's index in the background, and answers with the job
   * doing it. An index pass already running is returned rather than duplicated.
   */
  @Post('reindex')
  reindex(@Param('projectId') projectId: string): Promise<Job> {
    return this.index.requestReindex(projectId);
  }
}

function toFilter(query: SearchQueryDto): SearchFilter {
  return {
    text: query.q,
    sourceTypes: query.sourceType,
    entityTypes: query.entityType,
    statuses: query.status,
    tags: query.tag,
    updatedAfter: query.updatedAfter,
    updatedBefore: query.updatedBefore,
    includeArchived: query.includeArchived,
    limit: query.limit,
    offset: query.offset,
  };
}
