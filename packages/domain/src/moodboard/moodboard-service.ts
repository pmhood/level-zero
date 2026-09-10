import { type AssetRepository } from '../asset/asset-repository';
import { type Entity } from '../entity/entity';
import { type EntityService } from '../entity/entity-service';
import { type EntityRelationship } from '../relationship/entity-relationship';
import { type EntityRelationshipService } from '../relationship/entity-relationship-service';
import { type RelationType } from '../relationship/relation-type';
import { type Clock } from '../shared/clock';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { optionalText } from '../shared/validation';
import {
  createMoodboardConnector,
  MAX_MOODBOARD_CONNECTOR_LABEL_LENGTH,
  type MoodboardConnector,
} from './moodboard-connector';
import {
  createMoodboardNode,
  updateMoodboardNode,
  type CreateMoodboardNodeInput,
  type MoodboardNode,
  type UpdateMoodboardNodeInput,
} from './moodboard-node';
import { type MoodboardRepository } from './moodboard-repository';

export interface MoodboardServiceDeps {
  clock: Clock;
  ids: IdGenerator;
}

/** A board and everything on it — one read, because a canvas opens whole. */
export interface Moodboard {
  board: Entity;
  nodes: MoodboardNode[];
  connectors: MoodboardConnector[];
}

export type AddMoodboardNodeInput = Omit<CreateMoodboardNodeInput, 'projectId' | 'boardId'>;

/** One node's share of a bulk layout change: a drag moves a whole selection. */
export interface MoodboardNodePatch extends UpdateMoodboardNodeInput {
  id: string;
}

export interface ConnectMoodboardNodesInput {
  fromNodeId: string;
  toNodeId: string;
  label?: string | null;
}

/** The connector and the project-graph edge it was explicitly turned into. */
export interface MoodboardConnectorPromotion {
  connector: MoodboardConnector;
  relationship: EntityRelationship;
}

/** How far a duplicate is offset from its original, so it is visibly a copy. */
export const DUPLICATE_MOODBOARD_NODE_OFFSET = 24;

/**
 * Freeform visual boards, stored as placement rather than as content.
 *
 * The board is an ordinary `Entity` of type `moodboard`, so it is named, tagged,
 * archived, searched and related to other entities like everything else, and is
 * created and renamed through the entities endpoints. What this service adds is
 * the part an entity cannot express: where things sit on one particular board.
 *
 * Nodes hold layout and a reference. Nothing here copies an asset or an entity,
 * so the same image can be on three boards at once, and removing it from one
 * board is a `DELETE` of that placement and nothing else.
 */
export class MoodboardService {
  constructor(
    private readonly boards: MoodboardRepository,
    private readonly entities: EntityService,
    private readonly assets: AssetRepository,
    private readonly relationships: EntityRelationshipService,
    private readonly deps: MoodboardServiceDeps,
  ) {}

  /** The board with its nodes and connectors, ready to render. */
  async open(projectId: string, boardId: string): Promise<Moodboard> {
    const board = await this.requireBoard(projectId, boardId);
    const [nodes, connectors] = await Promise.all([
      this.boards.listNodes(projectId, boardId),
      this.boards.listConnectors(projectId, boardId),
    ]);

    return { board, nodes, connectors };
  }

  /**
   * Places something on the board.
   *
   * The referenced asset or entity is read through the project first, so an id
   * from another project fails as "not found" before a placement exists.
   */
  async addNode(
    projectId: string,
    boardId: string,
    input: AddMoodboardNodeInput,
  ): Promise<MoodboardNode> {
    await this.requireEditableBoard(projectId, boardId);

    const node = createMoodboardNode({ ...input, projectId, boardId }, this.deps);
    await this.requireReferencedRow(node);
    await this.requireGroup(projectId, boardId, node.groupId, node.id, node.type);

    const [inserted] = await this.boards.insertNodes([node]);
    if (!inserted) throw new Error('Insert returned no moodboard node');
    return inserted;
  }

  /**
   * Applies a layout change to several nodes at once.
   *
   * Dragging, resizing or reordering a selection is one gesture, so it is one
   * request: sending a change per node makes a big board feel worse for no
   * reason.
   *
   * A locked node refuses to be moved, resized or rotated. Everything else —
   * its order, its group, its content — still changes, because locking a tile
   * is about not nudging it by accident, not about freezing the board around
   * it.
   */
  async updateNodes(
    projectId: string,
    boardId: string,
    patches: readonly MoodboardNodePatch[],
  ): Promise<MoodboardNode[]> {
    await this.requireEditableBoard(projectId, boardId);
    if (patches.length === 0) return [];

    const updated: MoodboardNode[] = [];
    for (const { id, ...patch } of patches) {
      const node = await this.requireNode(projectId, boardId, id);
      const next = updateMoodboardNode(node, patch, this.deps);

      if (node.locked && next.locked && movesOnCanvas(node, next)) {
        throw new ConflictError('Unlock the node before moving it', { nodeId: node.id });
      }
      await this.requireGroup(projectId, boardId, next.groupId, next.id, next.type);
      updated.push(next);
    }

    return this.boards.saveNodes(updated);
  }

  /**
   * Takes a node off the board.
   *
   * This deletes the placement and the connectors touching it. The asset or
   * entity it pointed at is untouched: it is still in the library, still on
   * every other board, and still wherever else the project references it.
   */
  async removeNode(projectId: string, boardId: string, nodeId: string): Promise<void> {
    await this.requireEditableBoard(projectId, boardId);
    await this.requireNode(projectId, boardId, nodeId);
    await this.boards.deleteNode(projectId, nodeId);
  }

  /**
   * Takes multiple nodes off the board in one request.
   *
   * Removes all placements and their connectors atomically, so a failure
   * removes nothing. The assets or entities they pointed at are untouched.
   */
  async removeNodes(
    projectId: string,
    boardId: string,
    nodeIds: readonly string[],
  ): Promise<void> {
    await this.requireEditableBoard(projectId, boardId);
    if (nodeIds.length === 0) return;

    for (const nodeId of nodeIds) {
      await this.requireNode(projectId, boardId, nodeId);
    }

    await this.boards.deleteNodes(projectId, nodeIds);
  }

  /**
   * Copies placements, not the things they point at.
   *
   * A duplicated asset node is a second placement of the *same* asset row. A
   * duplicated group brings its members with it, remapped onto the new group.
   */
  async duplicateNodes(
    projectId: string,
    boardId: string,
    nodeIds: readonly string[],
    offset: number = DUPLICATE_MOODBOARD_NODE_OFFSET,
  ): Promise<MoodboardNode[]> {
    await this.requireEditableBoard(projectId, boardId);
    if (nodeIds.length === 0) return [];

    const originals: MoodboardNode[] = [];
    for (const nodeId of nodeIds) {
      originals.push(await this.requireNode(projectId, boardId, nodeId));
    }

    const copies = originals.map((node) =>
      createMoodboardNode(
        { ...node, x: node.x + offset, y: node.y + offset, groupId: null },
        this.deps,
      ),
    );

    const newGroupIds = new Map(originals.map((node, index) => [node.id, copies[index]!.id]));
    for (const [index, node] of originals.entries()) {
      copies[index]!.groupId = node.groupId ? (newGroupIds.get(node.groupId) ?? null) : null;
    }

    return this.boards.insertNodes(copies);
  }

  /**
   * Draws a line between two nodes.
   *
   * This is an annotation on the board and nothing more — see
   * `promoteConnector` for the one action that reaches the project graph.
   */
  async connect(
    projectId: string,
    boardId: string,
    input: ConnectMoodboardNodesInput,
  ): Promise<MoodboardConnector> {
    await this.requireEditableBoard(projectId, boardId);

    const connector = createMoodboardConnector({ ...input, projectId, boardId }, this.deps);
    await this.requireNode(projectId, boardId, connector.fromNodeId);
    await this.requireNode(projectId, boardId, connector.toNodeId);

    return this.boards.insertConnector(connector);
  }

  /** Retitles a connector. Its endpoints are its identity and never move. */
  async annotateConnector(
    projectId: string,
    boardId: string,
    connectorId: string,
    label: string | null,
  ): Promise<MoodboardConnector> {
    await this.requireEditableBoard(projectId, boardId);
    const connector = await this.requireConnector(projectId, boardId, connectorId);

    return this.boards.saveConnector({
      ...connector,
      label: optionalText('label', label, MAX_MOODBOARD_CONNECTOR_LABEL_LENGTH),
      updatedAt: this.deps.clock.now(),
    });
  }

  /** Erases the line. Any relationship it was promoted into stays in the graph. */
  async disconnect(projectId: string, boardId: string, connectorId: string): Promise<void> {
    await this.requireEditableBoard(projectId, boardId);
    await this.requireConnector(projectId, boardId, connectorId);
    await this.boards.deleteConnector(projectId, connectorId);
  }

  /**
   * Turns a drawn line into a real edge in the project graph.
   *
   * This is the *only* path from a board annotation to an
   * `EntityRelationship`, and it is deliberately a separate action a person
   * takes: a line sketched while arranging references should never quietly
   * become project canon. Both ends have to be entity nodes, because an asset
   * has no place in the entity graph without an `asset_reference` entity in
   * front of it.
   */
  async promoteConnector(
    projectId: string,
    boardId: string,
    connectorId: string,
    relation: RelationType,
  ): Promise<MoodboardConnectorPromotion> {
    await this.requireEditableBoard(projectId, boardId);
    const connector = await this.requireConnector(projectId, boardId, connectorId);

    if (connector.relationshipId) {
      throw new ConflictError('That connector has already been promoted', {
        connectorId: connector.id,
        relationshipId: connector.relationshipId,
      });
    }

    const source = await this.requireEntityEndpoint(projectId, boardId, connector.fromNodeId);
    const target = await this.requireEntityEndpoint(projectId, boardId, connector.toNodeId);

    const relationship = await this.relationships.draftLink(projectId, {
      sourceEntityId: source,
      targetEntityId: target,
      relation,
      metadata: { boardId, connectorId: connector.id },
    });

    // One write, because the edge and the connector recording it are one fact:
    // the check above rules out a second promotion, but only a transaction
    // rules out a half-finished first one.
    const promoted = await this.boards.promoteConnector(
      { ...connector, relationshipId: relationship.id, updatedAt: this.deps.clock.now() },
      relationship,
    );

    return { connector: promoted, relationship };
  }

  /** Boards are entities, so a wrong-typed id reads the same as a missing one. */
  private async requireBoard(projectId: string, boardId: string): Promise<Entity> {
    const board = await this.entities.getById(projectId, boardId);
    if (board.type !== 'moodboard') {
      throw new ValidationError('That entity is not a moodboard', {
        entityId: board.id,
        type: board.type,
      });
    }
    return board;
  }

  private async requireEditableBoard(projectId: string, boardId: string): Promise<Entity> {
    const board = await this.requireBoard(projectId, boardId);
    if (board.status === 'archived') {
      throw new ConflictError('Restore the moodboard before editing it', { entityId: board.id });
    }
    return board;
  }

  private async requireNode(
    projectId: string,
    boardId: string,
    nodeId: string,
  ): Promise<MoodboardNode> {
    const node = await this.boards.findNode(projectId, nodeId);
    if (!node || node.boardId !== boardId) throw new NotFoundError('Moodboard node', nodeId);
    return node;
  }

  private async requireConnector(
    projectId: string,
    boardId: string,
    connectorId: string,
  ): Promise<MoodboardConnector> {
    const connector = await this.boards.findConnector(projectId, connectorId);
    if (!connector || connector.boardId !== boardId) {
      throw new NotFoundError('Moodboard connector', connectorId);
    }
    return connector;
  }

  /** Reads the canonical row a node points at, purely to prove it exists here. */
  private async requireReferencedRow(node: MoodboardNode): Promise<void> {
    if (node.entityId) {
      await this.entities.getById(node.projectId, node.entityId);
      return;
    }
    if (node.assetId && !(await this.assets.findById(node.projectId, node.assetId))) {
      throw new NotFoundError('Asset', node.assetId);
    }
  }

  /**
   * Checks a node is being put into a group that exists on this board.
   *
   * Groups do not nest: one level keeps group/ungroup obvious and makes a cycle
   * structurally impossible rather than something to detect.
   */
  private async requireGroup(
    projectId: string,
    boardId: string,
    groupId: string | null,
    nodeId?: string,
    nodeType?: MoodboardNode['type'],
  ): Promise<void> {
    if (!groupId) return;
    if (nodeType === 'group') {
      throw new ValidationError('Groups cannot be nested inside other groups', { nodeId });
    }

    const group = await this.requireNode(projectId, boardId, groupId);
    if (group.type !== 'group') {
      throw new ValidationError('A node can only be grouped under a group node', {
        groupId,
        type: group.type,
      });
    }
  }

  private async requireEntityEndpoint(
    projectId: string,
    boardId: string,
    nodeId: string,
  ): Promise<string> {
    const node = await this.requireNode(projectId, boardId, nodeId);
    if (!node.entityId) {
      throw new ValidationError('Only connectors between entity nodes can become relationships', {
        nodeId: node.id,
        type: node.type,
      });
    }
    return node.entityId;
  }
}

/** Whether a change would move, resize or turn the node where it sits. */
function movesOnCanvas(node: MoodboardNode, next: MoodboardNode): boolean {
  return (
    node.x !== next.x ||
    node.y !== next.y ||
    node.width !== next.width ||
    node.height !== next.height ||
    node.rotation !== next.rotation
  );
}
