import {
  ConflictError,
  type EntityVersion,
  type EntityVersionRepository,
  type VersionListFilter,
  type VersionPage,
} from '@level-zero/domain';
import { and, count, desc, eq, max, sql } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import { entityVersions } from '../schema/entity-versions';
import { toEntityVersion, toEntityVersionRow } from './mappers';

/** Postgres SQLSTATE for a unique-constraint violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * Postgres adapter for the domain's `EntityVersionRepository` port.
 *
 * There is no update or delete: versions are append-only.
 */
export class DrizzleEntityVersionRepository implements EntityVersionRepository {
  constructor(private readonly db: Database) {}

  async insert(version: EntityVersion): Promise<EntityVersion> {
    try {
      const [row] = await this.db
        .insert(entityVersions)
        .values(toEntityVersionRow(version))
        .returning();

      if (!row) throw new Error('Insert returned no version row');
      return toEntityVersion(row);
    } catch (error) {
      // Two commits raced for the same version number. The caller can retry.
      if (hasPostgresCode(error, UNIQUE_VIOLATION)) {
        throw new ConflictError('Another version was recorded at the same time; try again', {
          entityId: version.entityId,
          versionNumber: version.versionNumber,
        });
      }
      throw error;
    }
  }

  async findById(projectId: string, versionId: string): Promise<EntityVersion | null> {
    const [row] = await this.db
      .select()
      .from(entityVersions)
      .where(and(eq(entityVersions.id, versionId), eq(entityVersions.projectId, projectId)))
      .limit(1);

    return row ? toEntityVersion(row) : null;
  }

  async listForEntity(
    projectId: string,
    entityId: string,
    filter: VersionListFilter,
  ): Promise<VersionPage> {
    const where = and(
      eq(entityVersions.projectId, projectId),
      eq(entityVersions.entityId, entityId),
      ...(filter.branchName ? [eq(entityVersions.branchName, filter.branchName)] : []),
    );

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(entityVersions)
        .where(where)
        .orderBy(desc(entityVersions.versionNumber))
        .limit(filter.limit ?? 50)
        .offset(filter.offset ?? 0),
      this.db.select({ value: count() }).from(entityVersions).where(where),
    ]);

    return { items: rows.map(toEntityVersion), total: totals?.value ?? 0 };
  }

  async latestVersionNumber(projectId: string, entityId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: max(entityVersions.versionNumber) })
      .from(entityVersions)
      .where(and(eq(entityVersions.projectId, projectId), eq(entityVersions.entityId, entityId)));

    return row?.value ?? 0;
  }

  async findBranchTip(
    projectId: string,
    entityId: string,
    branchName: string,
  ): Promise<EntityVersion | null> {
    const [row] = await this.db
      .select()
      .from(entityVersions)
      .where(
        and(
          eq(entityVersions.projectId, projectId),
          eq(entityVersions.entityId, entityId),
          eq(entityVersions.branchName, branchName),
        ),
      )
      .orderBy(desc(entityVersions.versionNumber))
      .limit(1);

    return row ? toEntityVersion(row) : null;
  }

  async listBranches(projectId: string, entityId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ branchName: entityVersions.branchName })
      .from(entityVersions)
      .where(and(eq(entityVersions.projectId, projectId), eq(entityVersions.entityId, entityId)))
      .orderBy(sql`${entityVersions.branchName} asc`);

    return rows.map((row) => row.branchName);
  }
}

/** Drizzle wraps driver errors, so the SQLSTATE lives on the cause chain. */
function hasPostgresCode(error: unknown, code: string): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ((current as Error & { code?: string }).code === code) return true;
  }
  return false;
}
