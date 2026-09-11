import {
  AssetSelectionService,
  type ApproveAssetResult,
  type AssetSelection,
  type AssetSelectionSummary,
} from '@level-zero/domain';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import {
  ApproveAssetSelectionDto,
  AssetSelectionContextQueryDto,
  DecideAssetSelectionDto,
} from './dto/asset-selection.dto';

/**
 * Which assets a project chose, and what it chose them for.
 *
 * `POST` records one decision; nothing updates or deletes one, so what comes
 * back from the reads is the whole history. A finished generation never appears
 * here on its own — every row is somebody saying so.
 */
@Controller('projects/:projectId/asset-selections')
export class AssetSelectionsController {
  constructor(private readonly selections: AssetSelectionService) {}

  /** What is approved for one purpose now, and every decision behind it. */
  @Get()
  summary(
    @Param('projectId') projectId: string,
    @Query() query: AssetSelectionContextQueryDto,
  ): Promise<AssetSelectionSummary> {
    return this.selections.getSummary(projectId, contextOf(query));
  }

  /** Every decision made for one entity, across all of its purposes. */
  @Get('entity/:entityId')
  forEntity(
    @Param('projectId') projectId: string,
    @Param('entityId') entityId: string,
  ): Promise<AssetSelection[]> {
    return this.selections.listForEntity(projectId, entityId);
  }

  /** Every decision about one asset, so a rejected concept stays traceable. */
  @Get('asset/:assetId')
  forAsset(
    @Param('projectId') projectId: string,
    @Param('assetId') assetId: string,
  ): Promise<AssetSelection[]> {
    return this.selections.listForAsset(projectId, assetId);
  }

  /**
   * Approves an asset for a purpose, superseding the approvals it replaces.
   *
   * `supersedes` is what makes "make this the portrait" one act: each replaced
   * asset gets a `superseded` row naming this approval, rather than having its
   * approval quietly cleared.
   */
  @Post('approve')
  approve(
    @Param('projectId') projectId: string,
    @Body() body: ApproveAssetSelectionDto,
  ): Promise<ApproveAssetResult> {
    return this.selections.approve(projectId, {
      assetId: body.assetId,
      context: contextOf(body),
      actor: body.actor,
      note: body.note,
      supersedes: body.supersedes,
    });
  }

  /** Turns an asset down for a purpose. The file and its provenance are untouched. */
  @Post('reject')
  reject(
    @Param('projectId') projectId: string,
    @Body() body: DecideAssetSelectionDto,
  ): Promise<AssetSelection> {
    return this.selections.reject(projectId, {
      assetId: body.assetId,
      context: contextOf(body),
      actor: body.actor,
      note: body.note,
    });
  }
}

function contextOf(input: AssetSelectionContextQueryDto) {
  return { entityId: input.entityId, purpose: input.purpose };
}
