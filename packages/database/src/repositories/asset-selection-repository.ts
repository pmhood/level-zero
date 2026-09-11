import {
  type AssetSelection,
  type AssetSelectionContext,
  type AssetSelectionRepository,
} from '@level-zero/domain';
import { and, desc, eq, type SQL } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import { assetSelections } from '../schema/selections';
import { toAssetSelection, toAssetSelectionRow } from './mappers';

/**
 * Postgres adapter for the domain's `AssetSelectionRepository` port.
 *
 * Insert and read only: a selection is an act somebody took, so there is
 * nothing to update and nothing to delete. Reads come back newest first, which
 * is the order `latestSelectionByAsset` relies on to find the decision still in
 * force.
 */
export class DrizzleAssetSelectionRepository implements AssetSelectionRepository {
  constructor(private readonly db: Database) {}

  /**
   * One statement, so an approval and the supersessions that name it land
   * together or not at all.
   */
  async insertMany(selections: readonly AssetSelection[]): Promise<AssetSelection[]> {
    if (selections.length === 0) return [];

    const rows = await this.db
      .insert(assetSelections)
      .values(selections.map(toAssetSelectionRow))
      .returning();

    // Answered in the order asked, because callers read the approval as the
    // first element and `RETURNING` promises nothing about row order.
    const byId = new Map(rows.map((row) => [row.id, toAssetSelection(row)]));

    return selections.map((selection) => {
      const inserted = byId.get(selection.id);
      if (!inserted) throw new Error('Insert returned no row for an asset selection');
      return inserted;
    });
  }

  async listByContext(
    projectId: string,
    context: AssetSelectionContext,
  ): Promise<AssetSelection[]> {
    return this.list(
      projectId,
      eq(assetSelections.contextEntityId, context.entityId),
      eq(assetSelections.purpose, context.purpose),
    );
  }

  async listByAsset(projectId: string, assetId: string): Promise<AssetSelection[]> {
    return this.list(projectId, eq(assetSelections.assetId, assetId));
  }

  async listByContextEntity(projectId: string, entityId: string): Promise<AssetSelection[]> {
    return this.list(projectId, eq(assetSelections.contextEntityId, entityId));
  }

  private async list(projectId: string, ...conditions: SQL[]): Promise<AssetSelection[]> {
    const rows = await this.db
      .select()
      .from(assetSelections)
      .where(and(eq(assetSelections.projectId, projectId), ...conditions))
      .orderBy(desc(assetSelections.decidedAt), desc(assetSelections.id));

    return rows.map(toAssetSelection);
  }
}
