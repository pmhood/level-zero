import { type EntityRelationship } from '../relationship/entity-relationship';
import { type MoodboardConnector } from './moodboard-connector';
import { type MoodboardNode } from './moodboard-node';

/**
 * Storage port for board layout.
 *
 * There is no paging: a canvas is opened whole, so its nodes are read whole.
 * Every method is scoped by `projectId` like the rest of the repositories, so a
 * board id from another project reads as missing rather than forbidden.
 *
 * Removing a node removes its placement and the connectors touching it. The
 * asset or entity it pointed at is never read, written or deleted from here —
 * layout storage has no reason to reach into canonical content. The single
 * exception is `promoteConnector`, which has one: the edge it publishes and the
 * connector recording it have to be written together.
 */
export interface MoodboardRepository {
  listNodes(projectId: string, boardId: string): Promise<MoodboardNode[]>;
  findNode(projectId: string, nodeId: string): Promise<MoodboardNode | null>;
  insertNodes(nodes: readonly MoodboardNode[]): Promise<MoodboardNode[]>;
  saveNodes(nodes: readonly MoodboardNode[]): Promise<MoodboardNode[]>;
  /** Also clears the group from any node inside it, and drops its connectors. */
  deleteNode(projectId: string, nodeId: string): Promise<void>;

  listConnectors(projectId: string, boardId: string): Promise<MoodboardConnector[]>;
  findConnector(projectId: string, connectorId: string): Promise<MoodboardConnector | null>;
  insertConnector(connector: MoodboardConnector): Promise<MoodboardConnector>;
  saveConnector(connector: MoodboardConnector): Promise<MoodboardConnector>;
  /**
   * Writes `relationship` into the project graph and the connector that now
   * points at it, together or not at all.
   *
   * The one place layout storage writes canonical content, and the reason it
   * does is atomicity: an edge nothing points at, or a connector claiming an
   * edge that was never written, is exactly the accidental relationship
   * promotion exists to prevent. `connector` is the post-promotion state, as
   * for `saveConnector`, and its `relationshipId` is `relationship.id`.
   *
   * A connector that was promoted in the meantime throws `ConflictError` and
   * leaves the graph untouched, so two racing promotions produce one edge.
   */
  promoteConnector(
    connector: MoodboardConnector,
    relationship: EntityRelationship,
  ): Promise<MoodboardConnector>;
  deleteConnector(projectId: string, connectorId: string): Promise<void>;
}
