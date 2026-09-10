import {
  ConflictError,
  NotFoundError,
  type EntityRelationship,
  type MoodboardConnector,
  type MoodboardNode,
  type MoodboardRepository,
} from '@level-zero/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import { entityRelationships } from '../schema/entity-relationships';
import { moodboardConnectors, moodboardNodes } from '../schema/moodboards';
import {
  toEntityRelationshipRow,
  toMoodboardConnector,
  toMoodboardConnectorRow,
  toMoodboardNode,
  toMoodboardNodeRow,
} from './mappers';
import { UNIQUE_VIOLATION, hasPostgresCode } from './postgres-errors';

/**
 * Postgres adapter for the domain's `MoodboardRepository` port.
 *
 * Nothing here touches `assets` or `entities`: a node carries a reference, so
 * deleting a placement is one `DELETE` against this table. The group and
 * connector clean-up a delete implies is the schema's own `ON DELETE SET NULL`
 * and `ON DELETE CASCADE`, not a second statement that could be forgotten.
 *
 * `promoteConnector` is the one method that writes outside these two tables,
 * because the edge it publishes has to land with the connector or not at all.
 */
export class DrizzleMoodboardRepository implements MoodboardRepository {
  constructor(private readonly db: Database) {}

  async listNodes(projectId: string, boardId: string): Promise<MoodboardNode[]> {
    const rows = await this.db
      .select()
      .from(moodboardNodes)
      .where(and(eq(moodboardNodes.projectId, projectId), eq(moodboardNodes.boardId, boardId)))
      .orderBy(asc(moodboardNodes.zOrder), asc(moodboardNodes.createdAt));

    return rows.map(toMoodboardNode);
  }

  async findNode(projectId: string, nodeId: string): Promise<MoodboardNode | null> {
    const [row] = await this.db
      .select()
      .from(moodboardNodes)
      .where(and(eq(moodboardNodes.id, nodeId), eq(moodboardNodes.projectId, projectId)))
      .limit(1);

    return row ? toMoodboardNode(row) : null;
  }

  /** Same lookup as `findNode`, batched: one query for however many ids are given. */
  async findNodes(projectId: string, nodeIds: readonly string[]): Promise<MoodboardNode[]> {
    if (nodeIds.length === 0) return [];

    const rows = await this.db
      .select()
      .from(moodboardNodes)
      .where(
        and(eq(moodboardNodes.projectId, projectId), inArray(moodboardNodes.id, [...nodeIds])),
      );

    return rows.map(toMoodboardNode);
  }

  /** One statement, so duplicating a group and its members is one round trip. */
  async insertNodes(nodes: readonly MoodboardNode[]): Promise<MoodboardNode[]> {
    if (nodes.length === 0) return [];

    const rows = await this.db
      .insert(moodboardNodes)
      .values(nodes.map(toMoodboardNodeRow))
      .returning();

    return rows.map(toMoodboardNode);
  }

  /**
   * Writes a whole selection's layout in one transaction, so a drag either
   * lands completely or not at all.
   *
   * `type`, `asset_id` and `entity_id` are absent from the update on purpose:
   * a placement can move, but it cannot start pointing somewhere else.
   */
  async saveNodes(nodes: readonly MoodboardNode[]): Promise<MoodboardNode[]> {
    if (nodes.length === 0) return [];

    return this.db.transaction(async (tx) => {
      const saved: MoodboardNode[] = [];

      for (const node of nodes) {
        const [row] = await tx
          .update(moodboardNodes)
          .set({
            groupId: node.groupId,
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            rotation: node.rotation,
            zOrder: node.zOrder,
            locked: node.locked,
            data: node.data,
            updatedAt: node.updatedAt,
          })
          .where(and(eq(moodboardNodes.id, node.id), eq(moodboardNodes.projectId, node.projectId)))
          .returning();

        if (!row) throw new NotFoundError('Moodboard node', node.id);
        saved.push(toMoodboardNode(row));
      }

      return saved;
    });
  }

  async deleteNode(projectId: string, nodeId: string): Promise<void> {
    await this.db
      .delete(moodboardNodes)
      .where(and(eq(moodboardNodes.id, nodeId), eq(moodboardNodes.projectId, projectId)));
  }

  async listConnectors(projectId: string, boardId: string): Promise<MoodboardConnector[]> {
    const rows = await this.db
      .select()
      .from(moodboardConnectors)
      .where(
        and(eq(moodboardConnectors.projectId, projectId), eq(moodboardConnectors.boardId, boardId)),
      )
      .orderBy(asc(moodboardConnectors.createdAt));

    return rows.map(toMoodboardConnector);
  }

  async findConnector(projectId: string, connectorId: string): Promise<MoodboardConnector | null> {
    const [row] = await this.db
      .select()
      .from(moodboardConnectors)
      .where(
        and(eq(moodboardConnectors.id, connectorId), eq(moodboardConnectors.projectId, projectId)),
      )
      .limit(1);

    return row ? toMoodboardConnector(row) : null;
  }

  async insertConnector(connector: MoodboardConnector): Promise<MoodboardConnector> {
    const [row] = await this.db
      .insert(moodboardConnectors)
      .values(toMoodboardConnectorRow(connector))
      .returning();

    if (!row) throw new Error('Insert returned no moodboard connector row');
    return toMoodboardConnector(row);
  }

  async saveConnector(connector: MoodboardConnector): Promise<MoodboardConnector> {
    const [row] = await this.db
      .update(moodboardConnectors)
      .set({
        label: connector.label,
        relationshipId: connector.relationshipId,
        updatedAt: connector.updatedAt,
      })
      .where(
        and(
          eq(moodboardConnectors.id, connector.id),
          eq(moodboardConnectors.projectId, connector.projectId),
        ),
      )
      .returning();

    if (!row) throw new NotFoundError('Moodboard connector', connector.id);
    return toMoodboardConnector(row);
  }

  /**
   * Publishes the connector into the project graph: the edge and the
   * back-pointer to it, in one transaction.
   *
   * The connector row is locked before either write, so two promotions of the
   * same line queue up and the loser sees the winner's `relationship_id` and
   * throws instead of writing a second edge. A failure anywhere in here rolls
   * the edge back with it, leaving the board exactly as it was.
   */
  async promoteConnector(
    connector: MoodboardConnector,
    relationship: EntityRelationship,
  ): Promise<MoodboardConnector> {
    try {
      return await this.db.transaction(async (tx) => {
        const [locked] = await tx
          .select({ relationshipId: moodboardConnectors.relationshipId })
          .from(moodboardConnectors)
          .where(
            and(
              eq(moodboardConnectors.id, connector.id),
              eq(moodboardConnectors.projectId, connector.projectId),
            ),
          )
          .for('update')
          .limit(1);

        if (!locked) throw new NotFoundError('Moodboard connector', connector.id);
        if (locked.relationshipId) {
          throw new ConflictError('That connector has already been promoted', {
            connectorId: connector.id,
            relationshipId: locked.relationshipId,
          });
        }

        await tx.insert(entityRelationships).values(toEntityRelationshipRow(relationship));

        const [row] = await tx
          .update(moodboardConnectors)
          .set({ relationshipId: connector.relationshipId, updatedAt: connector.updatedAt })
          .where(
            and(
              eq(moodboardConnectors.id, connector.id),
              eq(moodboardConnectors.projectId, connector.projectId),
            ),
          )
          .returning();

        if (!row) throw new NotFoundError('Moodboard connector', connector.id);
        return toMoodboardConnector(row);
      });
    } catch (error) {
      // Another writer took either the edge or the relationship id first. The
      // transaction rolled back with it, so the board is exactly as it was.
      if (hasPostgresCode(error, UNIQUE_VIOLATION)) {
        throw new ConflictError('That promotion raced another write and was rolled back', {
          connectorId: connector.id,
        });
      }
      throw error;
    }
  }

  async deleteConnector(projectId: string, connectorId: string): Promise<void> {
    await this.db
      .delete(moodboardConnectors)
      .where(
        and(eq(moodboardConnectors.id, connectorId), eq(moodboardConnectors.projectId, projectId)),
      );
  }
}
