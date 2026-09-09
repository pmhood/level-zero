import {
  ConflictError,
  NotFoundError,
  type PrototypeVersion,
  type PrototypeVersionListFilter,
  type PrototypeVersionPage,
  type PrototypeVersionRepository,
} from '@level-zero/domain';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import {
  prototypeEntityVersions,
  prototypeVersions,
  type PrototypeEntityVersionRow,
} from '../schema/prototype-versions';
import { toPrototypeEntityVersionRows, toPrototypeVersion, toPrototypeVersionRow } from './mappers';
import { UNIQUE_VIOLATION, hasPostgresCode } from './postgres-errors';

/**
 * Postgres adapter for the domain's `PrototypeVersionRepository` port.
 *
 * A version and its pinned members are written in one transaction, so a
 * prototype version never exists without the entity versions it claims to be
 * made of. `save` updates annotations only; the members are inserted once and
 * never rewritten.
 */
export class DrizzlePrototypeVersionRepository implements PrototypeVersionRepository {
  constructor(private readonly db: Database) {}

  async insert(version: PrototypeVersion): Promise<PrototypeVersion> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(prototypeVersions)
          .values(toPrototypeVersionRow(version))
          .returning();

        if (!row) throw new Error('Insert returned no prototype version row');

        const members = toPrototypeEntityVersionRows(version);
        const memberRows = members.length
          ? await tx.insert(prototypeEntityVersions).values(members).returning()
          : [];

        return toPrototypeVersion(row, sortByPosition(memberRows));
      });
    } catch (error) {
      // Two captures raced for the same version number. The caller can retry.
      if (hasPostgresCode(error, UNIQUE_VIOLATION)) {
        throw new ConflictError(
          'Another prototype version was captured at the same time; try again',
          {
            prototypeId: version.prototypeId,
            versionNumber: version.versionNumber,
          },
        );
      }
      throw error;
    }
  }

  async findById(projectId: string, prototypeVersionId: string): Promise<PrototypeVersion | null> {
    const [row] = await this.db
      .select()
      .from(prototypeVersions)
      .where(
        and(
          eq(prototypeVersions.id, prototypeVersionId),
          eq(prototypeVersions.projectId, projectId),
        ),
      )
      .limit(1);

    if (!row) return null;
    return toPrototypeVersion(row, await this.membersOf(projectId, [row.id]));
  }

  async listForPrototype(
    projectId: string,
    prototypeId: string,
    filter: PrototypeVersionListFilter,
  ): Promise<PrototypeVersionPage> {
    const where = and(
      eq(prototypeVersions.projectId, projectId),
      eq(prototypeVersions.prototypeId, prototypeId),
    );

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(prototypeVersions)
        .where(where)
        .orderBy(desc(prototypeVersions.versionNumber))
        .limit(filter.limit ?? 50)
        .offset(filter.offset ?? 0),
      this.db.select({ value: count() }).from(prototypeVersions).where(where),
    ]);

    const members = await this.membersOf(
      projectId,
      rows.map((row) => row.id),
    );

    return {
      items: rows.map((row) =>
        toPrototypeVersion(
          row,
          members.filter((member) => member.prototypeVersionId === row.id),
        ),
      ),
      total: totals?.value ?? 0,
    };
  }

  async latestVersionNumber(projectId: string, prototypeId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: prototypeVersions.versionNumber })
      .from(prototypeVersions)
      .where(
        and(
          eq(prototypeVersions.projectId, projectId),
          eq(prototypeVersions.prototypeId, prototypeId),
        ),
      )
      .orderBy(desc(prototypeVersions.versionNumber))
      .limit(1);

    return row?.value ?? 0;
  }

  /** Annotations only: the pinned members are not part of the update. */
  async save(version: PrototypeVersion): Promise<PrototypeVersion> {
    const [row] = await this.db
      .update(prototypeVersions)
      .set({
        status: version.status,
        notes: version.notes,
        buildAssetId: version.buildAssetId,
        updatedAt: version.updatedAt,
      })
      .where(
        and(
          eq(prototypeVersions.id, version.id),
          eq(prototypeVersions.projectId, version.projectId),
        ),
      )
      .returning();

    if (!row) throw new NotFoundError('Prototype version', version.id);
    return toPrototypeVersion(row, await this.membersOf(version.projectId, [row.id]));
  }

  private async membersOf(
    projectId: string,
    prototypeVersionIds: readonly string[],
  ): Promise<PrototypeEntityVersionRow[]> {
    if (prototypeVersionIds.length === 0) return [];

    return this.db
      .select()
      .from(prototypeEntityVersions)
      .where(
        and(
          eq(prototypeEntityVersions.projectId, projectId),
          inArray(prototypeEntityVersions.prototypeVersionId, [...prototypeVersionIds]),
        ),
      )
      .orderBy(asc(prototypeEntityVersions.position));
  }
}

function sortByPosition(rows: PrototypeEntityVersionRow[]): PrototypeEntityVersionRow[] {
  return [...rows].sort((a, b) => a.position - b.position);
}
