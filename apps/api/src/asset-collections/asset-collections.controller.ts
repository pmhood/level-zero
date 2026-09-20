import {
  AssetCollectionService,
  AssetLibraryService,
  type Asset,
  type Entity,
  type EntityRelationship,
} from '@level-zero/domain';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';

import {
  AddAssetToCollectionDto,
  CreateAssetCollectionDto,
  RenameAssetCollectionDto,
} from './dto/asset-collection.dto';

/**
 * Collections group assets for a team's own art direction without owning
 * them (`docs/decisions/asset-library-model.md` §4). A collection is an
 * ordinary `asset_collection` entity, so listing, tagging and restoring one
 * is done through the entities endpoints; what lives here is the membership
 * `addAsset`/`removeAsset` create and delete, plus the create/rename/archive
 * shorthand that fixes the entity `type` for a caller so it never has to
 * name it.
 */
@Controller('projects/:projectId/asset-collections')
export class AssetCollectionsController {
  constructor(
    private readonly collections: AssetCollectionService,
    private readonly library: AssetLibraryService,
  ) {}

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() body: CreateAssetCollectionDto,
  ): Promise<Entity> {
    return this.collections.create(projectId, body);
  }

  /**
   * Active member counts for every collection in the project that has at
   * least one — the rail's counts, one grouped read rather than one lookup
   * per collection. Declared before `:collectionId` routes so the literal
   * path wins.
   */
  @Get('counts')
  counts(@Param('projectId') projectId: string): Promise<Record<string, number>> {
    return this.library.collectionCounts(projectId);
  }

  /**
   * The derived cover for every collection that has at least one active
   * member — the rail's cover images, one grouped read rather than one
   * lookup per collection. Declared before `:collectionId` routes for the
   * same reason `counts` is.
   */
  @Get('covers')
  covers(@Param('projectId') projectId: string): Promise<Record<string, Asset>> {
    return this.library.collectionCovers(projectId);
  }

  @Patch(':collectionId')
  rename(
    @Param('projectId') projectId: string,
    @Param('collectionId') collectionId: string,
    @Body() body: RenameAssetCollectionDto,
  ): Promise<Entity> {
    return this.collections.rename(projectId, collectionId, body.name);
  }

  /** Delete-as-archive: every member asset, and its membership elsewhere, is untouched. */
  @Post(':collectionId/archive')
  archive(
    @Param('projectId') projectId: string,
    @Param('collectionId') collectionId: string,
  ): Promise<Entity> {
    return this.collections.archive(projectId, collectionId);
  }

  @Post(':collectionId/assets')
  addAsset(
    @Param('projectId') projectId: string,
    @Param('collectionId') collectionId: string,
    @Body() body: AddAssetToCollectionDto,
  ): Promise<EntityRelationship> {
    return this.collections.addAsset(projectId, collectionId, body.assetId);
  }

  /** Removes the membership only — the asset itself is untouched. */
  @Delete(':collectionId/assets/:assetId')
  @HttpCode(204)
  async removeAsset(
    @Param('projectId') projectId: string,
    @Param('collectionId') collectionId: string,
    @Param('assetId') assetId: string,
  ): Promise<void> {
    await this.collections.removeAsset(projectId, collectionId, assetId);
  }

  /**
   * Every collection this asset currently belongs to — the inspector's
   * Collection field (#228). Two path segments, so it never collides with
   * the single-segment `:collectionId` routes above regardless of
   * declaration order.
   */
  @Get('for-asset/:assetId')
  forAsset(
    @Param('projectId') projectId: string,
    @Param('assetId') assetId: string,
  ): Promise<Entity[]> {
    return this.collections.listForAsset(projectId, assetId);
  }
}
