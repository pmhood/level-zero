import {
  MoodboardService,
  type Moodboard,
  type MoodboardConnector,
  type MoodboardConnectorPromotion,
  type MoodboardNode,
} from '@level-zero/domain';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';

import {
  AddMoodboardNodeDto,
  AnnotateMoodboardConnectorDto,
  ConnectMoodboardNodesDto,
  DuplicateMoodboardNodesDto,
  PromoteMoodboardConnectorDto,
  UpdateMoodboardNodesDto,
} from './dto/moodboard.dto';

/**
 * Moodboards: freeform visual boards, stored as placement rather than content.
 *
 * The board itself is an ordinary `moodboard` entity, so it is created, renamed,
 * tagged and archived through the entities endpoints. What lives here is its
 * layout — where each asset or entity sits on this particular board.
 *
 * Nothing under these routes writes an asset or an entity. The one exception is
 * `connectors/:connectorId/promote`, which exists precisely so that turning a
 * drawn line into a project relationship is something a person asks for.
 */
@Controller('projects/:projectId/moodboards')
export class MoodboardsController {
  constructor(private readonly moodboards: MoodboardService) {}

  /** The board with its nodes and connectors: a canvas opens whole. */
  @Get(':boardId')
  open(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
  ): Promise<Moodboard> {
    return this.moodboards.open(projectId, boardId);
  }

  @Post(':boardId/nodes')
  addNode(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body() body: AddMoodboardNodeDto,
  ): Promise<MoodboardNode> {
    return this.moodboards.addNode(projectId, boardId, body);
  }

  /** One request for one gesture: a drag moves a whole selection. */
  @Patch(':boardId/nodes')
  updateNodes(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body() body: UpdateMoodboardNodesDto,
  ): Promise<MoodboardNode[]> {
    return this.moodboards.updateNodes(projectId, boardId, body.nodes);
  }

  /**
   * Copies placements. The assets and entities they point at are shared with
   * the originals, not duplicated.
   *
   * Declared before `nodes/:nodeId` so the literal path wins: Nest matches
   * routes in declaration order.
   */
  @Post(':boardId/nodes/duplicate')
  duplicateNodes(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body() body: DuplicateMoodboardNodesDto,
  ): Promise<MoodboardNode[]> {
    return this.moodboards.duplicateNodes(projectId, boardId, body.nodeIds, body.offset);
  }

  /** Removes the placement only — the asset or entity itself is untouched. */
  @Delete(':boardId/nodes/:nodeId')
  @HttpCode(204)
  async removeNode(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Param('nodeId') nodeId: string,
  ): Promise<void> {
    await this.moodboards.removeNode(projectId, boardId, nodeId);
  }

  @Post(':boardId/connectors')
  connect(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Body() body: ConnectMoodboardNodesDto,
  ): Promise<MoodboardConnector> {
    return this.moodboards.connect(projectId, boardId, body);
  }

  @Patch(':boardId/connectors/:connectorId')
  annotateConnector(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Param('connectorId') connectorId: string,
    @Body() body: AnnotateMoodboardConnectorDto,
  ): Promise<MoodboardConnector> {
    return this.moodboards.annotateConnector(projectId, boardId, connectorId, body.label ?? null);
  }

  /**
   * Turns the line into an `EntityRelationship`. The explicit action the
   * architecture asks for: drawing one never does this by itself.
   */
  @Post(':boardId/connectors/:connectorId/promote')
  promoteConnector(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Param('connectorId') connectorId: string,
    @Body() body: PromoteMoodboardConnectorDto,
  ): Promise<MoodboardConnectorPromotion> {
    return this.moodboards.promoteConnector(projectId, boardId, connectorId, body.relation);
  }

  /** Erases the line. A relationship promoted from it stays in the graph. */
  @Delete(':boardId/connectors/:connectorId')
  @HttpCode(204)
  async disconnect(
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @Param('connectorId') connectorId: string,
  ): Promise<void> {
    await this.moodboards.disconnect(projectId, boardId, connectorId);
  }
}
