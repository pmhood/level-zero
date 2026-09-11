import { type AssetMark, type AssetMarkKind, type AssetMarkRepository } from '@level-zero/domain';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import { assetMarks } from '../schema/selections';
import { toAssetMark, toAssetMarkRow } from './mappers';

/**
 * Postgres adapter for the domain's `AssetMarkRepository` port.
 *
 * A set, not a log. `add` leans on the unique constraint rather than reading
 * first, so two people starring the same result at once leaves one row and no
 * error; `remove` is a real delete, because an unstarring is not a fact anybody
 * needs later.
 */
export class DrizzleAssetMarkRepository implements AssetMarkRepository {
  constructor(private readonly db: Database) {}

  async add(mark: AssetMark): Promise<AssetMark> {
    const [inserted] = await this.db
      .insert(assetMarks)
      .values(toAssetMarkRow(mark))
      .onConflictDoNothing({
        target: [assetMarks.projectId, assetMarks.assetId, assetMarks.kind],
      })
      .returning();

    if (inserted) return toAssetMark(inserted);

    // Already marked: answer with the mark that is actually there, so the
    // caller sees who put it on and when rather than the row it just built.
    const [existing] = await this.db
      .select()
      .from(assetMarks)
      .where(and(...markConditions(mark.projectId, mark.assetId, mark.kind)))
      .limit(1);

    if (!existing) throw new Error('Asset mark neither inserted nor already present');
    return toAssetMark(existing);
  }

  async remove(projectId: string, assetId: string, kind: AssetMarkKind): Promise<boolean> {
    const removed = await this.db
      .delete(assetMarks)
      .where(and(...markConditions(projectId, assetId, kind)))
      .returning({ id: assetMarks.id });

    return removed.length > 0;
  }

  async listByProject(projectId: string, kinds?: readonly AssetMarkKind[]): Promise<AssetMark[]> {
    const rows = await this.db
      .select()
      .from(assetMarks)
      .where(
        and(
          eq(assetMarks.projectId, projectId),
          ...(kinds?.length ? [inArray(assetMarks.kind, [...kinds])] : []),
        ),
      )
      .orderBy(desc(assetMarks.markedAt), desc(assetMarks.id));

    return rows.map(toAssetMark);
  }
}

/** The three columns the unique constraint is on, and every write is scoped by. */
function markConditions(projectId: string, assetId: string, kind: AssetMarkKind) {
  return [
    eq(assetMarks.projectId, projectId),
    eq(assetMarks.assetId, assetId),
    eq(assetMarks.kind, kind),
  ];
}
