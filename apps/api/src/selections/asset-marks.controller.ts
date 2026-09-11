import { AssetSelectionService, type AssetMark, type AssetMarkKind } from '@level-zero/domain';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';

import { ListAssetMarksQueryDto, MarkAssetDto } from './dto/asset-selection.dto';

/**
 * The assets somebody set aside while triaging: favourites and the shortlist.
 *
 * A set, not a history — `POST` twice leaves one mark and `DELETE` takes it off
 * for good, because nobody needs the record of an unstarring. Deciding what an
 * asset is actually *for* is `asset-selections`.
 */
@Controller('projects/:projectId/asset-marks')
export class AssetMarksController {
  constructor(private readonly selections: AssetSelectionService) {}

  @Get()
  list(
    @Param('projectId') projectId: string,
    @Query() query: ListAssetMarksQueryDto,
  ): Promise<AssetMark[]> {
    return this.selections.listMarks(projectId, query.kind);
  }

  /** Idempotent: marking an already marked asset answers with the mark that stands. */
  @Post()
  mark(@Param('projectId') projectId: string, @Body() body: MarkAssetDto): Promise<AssetMark> {
    return this.selections.mark(projectId, body);
  }

  /** Removing a mark that is not there is not an error — the asset is unmarked either way. */
  @Delete(':assetId/:kind')
  @HttpCode(204)
  async unmark(
    @Param('projectId') projectId: string,
    @Param('assetId') assetId: string,
    @Param('kind') kind: AssetMarkKind,
  ): Promise<void> {
    await this.selections.unmark(projectId, assetId, kind);
  }
}
