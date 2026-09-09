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
 * layout storage has no reason to reach into canonical content.
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
  deleteConnector(projectId: string, connectorId: string): Promise<void>;
}
