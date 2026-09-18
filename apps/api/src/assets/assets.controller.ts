import {
  AssetLibraryService,
  AssetService,
  type Asset,
  type AssetLibraryPage,
  type AssetListFilter,
  type AssetPage,
  type AssetPipelineStage,
} from '@level-zero/domain';
import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { type Response } from 'express';

import { CreateAssetDto, ListAssetsQueryDto, SetAssetPipelineStageDto } from './dto/asset.dto';

/**
 * Assets are addressed under their project, the same as entities.
 *
 * Linking an asset into the entity graph — a character portrait, a moodboard
 * tile, a GDD figure — is done with an `asset_reference` entity and
 * `POST .../entities/:entityId/relationships`, not an endpoint here: this
 * controller only ever deals with the file and its metadata.
 */
@Controller('projects/:projectId/assets')
export class AssetsController {
  constructor(
    private readonly assets: AssetService,
    private readonly library: AssetLibraryService,
  ) {}

  @Post()
  upload(@Param('projectId') projectId: string, @Body() body: CreateAssetDto): Promise<Asset> {
    return this.assets.upload(projectId, {
      ...body,
      content: Buffer.from(body.contentBase64, 'base64'),
    });
  }

  /**
   * Plain by default, matching every caller that just wants a page of
   * assets (`character-visuals`, `moodboard-rail`). `?summary=true`, or any
   * summary-only filter such as `origin`, `markKinds`, `selectionStates`,
   * `linkedEntityId` or `collectionId`, switches to the joined library view
   * so a grid can show a badge per tile without a follow-up query per tile.
   */
  @Get()
  list(
    @Param('projectId') projectId: string,
    @Query() query: ListAssetsQueryDto,
  ): Promise<AssetPage | AssetLibraryPage> {
    const filter: AssetListFilter = {
      kinds: query.kind,
      variants: query.variant,
      statuses: query.status,
      sourceAssetId: query.sourceAssetId,
      search: query.search,
      mimeFamilies: query.mimeFamily,
      createdAfter: query.createdAfter,
      createdBefore: query.createdBefore,
      includeArchived: query.includeArchived,
      pipelineStages: query.pipelineStages,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      limit: query.limit,
      offset: query.offset,
    };

    if (
      query.summary ||
      query.origin !== undefined ||
      (query.markKinds && query.markKinds.length > 0) ||
      (query.selectionStates && query.selectionStates.length > 0) ||
      query.linkedEntityId !== undefined ||
      query.collectionId !== undefined
    ) {
      return this.library.list(projectId, {
        ...filter,
        origin: query.origin,
        markKinds: query.markKinds,
        selectionStates: query.selectionStates,
        linkedEntityId: query.linkedEntityId,
        collectionId: query.collectionId,
      });
    }

    return this.assets.listByProject(projectId, filter);
  }

  /**
   * Active asset counts per pipeline stage (issue #230's strip, reading
   * #229's `AssetLibraryService.stageCounts`) — one grouped read rather than
   * a `listByProject` call per stage. Declared before `:assetId` so the
   * literal path wins, the same reason `asset-collections`' `/counts` comes
   * before its own `:collectionId` routes.
   */
  @Get('pipeline-stage-counts')
  pipelineStageCounts(
    @Param('projectId') projectId: string,
  ): Promise<Partial<Record<AssetPipelineStage, number>>> {
    return this.library.stageCounts(projectId);
  }

  @Get(':assetId')
  get(@Param('projectId') projectId: string, @Param('assetId') assetId: string): Promise<Asset> {
    return this.assets.getById(projectId, assetId);
  }

  /** A URL safe to hand to a client, resolved through the configured storage provider. */
  @Get(':assetId/url')
  async getUrl(
    @Param('projectId') projectId: string,
    @Param('assetId') assetId: string,
  ): Promise<{ url: string }> {
    return { url: await this.assets.getUrl(projectId, assetId) };
  }

  /**
   * Streams the asset's bytes back, for local development and simple
   * integrations.
   *
   * `?download=true` adds the `Content-Disposition` a browser needs to save
   * the file instead of rendering it, which is what the asset inspector's
   * Download action asks for. It is opt-in per request because the same URL is
   * an `<img src>` everywhere else, and an `attachment` disposition would stop
   * those previews loading.
   */
  @Get(':assetId/content')
  async getContent(
    @Param('projectId') projectId: string,
    @Param('assetId') assetId: string,
    @Res() response: Response,
    @Query('download') download?: string,
  ): Promise<void> {
    const { asset, content } = await this.assets.download(projectId, assetId);
    response.setHeader('Content-Type', asset.mimeType);
    response.setHeader('Content-Length', content.byteLength);
    if (download !== undefined && download !== 'false') {
      response.setHeader('Content-Disposition', attachmentDisposition(asset.filename));
    }
    response.send(content);
  }

  @Post(':assetId/archive')
  archive(
    @Param('projectId') projectId: string,
    @Param('assetId') assetId: string,
  ): Promise<Asset> {
    return this.assets.archive(projectId, assetId);
  }

  @Post(':assetId/restore')
  restore(
    @Param('projectId') projectId: string,
    @Param('assetId') assetId: string,
  ): Promise<Asset> {
    return this.assets.restore(projectId, assetId);
  }

  /**
   * Moves an asset to a new pipeline stage
   * (`docs/decisions/asset-library-model.md` §6.3/§6.4). Any stage may move
   * to any other; the transition is recorded as an `asset_stage_changed`
   * activity by `AssetService.setPipelineStage`, never a bare column write.
   */
  @Post(':assetId/pipeline-stage')
  setPipelineStage(
    @Param('projectId') projectId: string,
    @Param('assetId') assetId: string,
    @Body() body: SetAssetPipelineStageDto,
  ): Promise<Asset> {
    return this.assets.setPipelineStage(projectId, assetId, body.stage, {
      actor: body.actor,
      note: body.note,
    });
  }

  /**
   * Queues a thumbnail for every existing source image asset in the project
   * that does not already have one (#176) — the catch-up for material
   * uploaded before thumbnail generation existed.
   */
  @Post('backfill-thumbnails')
  async backfillThumbnails(@Param('projectId') projectId: string): Promise<{ queued: number }> {
    return { queued: await this.assets.backfillThumbnails(projectId) };
  }
}

/**
 * RFC 6266's two spellings of one filename: the ASCII fallback every browser
 * reads, and the UTF-8 form that keeps a name the fallback had to flatten.
 */
function attachmentDisposition(filename: string): string {
  const ascii = filename.replace(/[^ -~]/g, '_').replace(/["\\]/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
