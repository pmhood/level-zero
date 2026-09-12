import { AssetService, type Asset, type AssetPage } from '@level-zero/domain';
import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { type Response } from 'express';

import { CreateAssetDto, ListAssetsQueryDto } from './dto/asset.dto';

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
  constructor(private readonly assets: AssetService) {}

  @Post()
  upload(@Param('projectId') projectId: string, @Body() body: CreateAssetDto): Promise<Asset> {
    return this.assets.upload(projectId, {
      ...body,
      content: Buffer.from(body.contentBase64, 'base64'),
    });
  }

  @Get()
  list(
    @Param('projectId') projectId: string,
    @Query() query: ListAssetsQueryDto,
  ): Promise<AssetPage> {
    return this.assets.listByProject(projectId, {
      kinds: query.kind,
      variants: query.variant,
      statuses: query.status,
      sourceAssetId: query.sourceAssetId,
      search: query.search,
      mimeFamilies: query.mimeFamily,
      createdAfter: query.createdAfter,
      createdBefore: query.createdBefore,
      includeArchived: query.includeArchived,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      limit: query.limit,
      offset: query.offset,
    });
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

  /** Streams the asset's bytes back, for local development and simple integrations. */
  @Get(':assetId/content')
  async getContent(
    @Param('projectId') projectId: string,
    @Param('assetId') assetId: string,
    @Res() response: Response,
  ): Promise<void> {
    const { asset, content } = await this.assets.download(projectId, assetId);
    response.setHeader('Content-Type', asset.mimeType);
    response.setHeader('Content-Length', content.byteLength);
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
}
