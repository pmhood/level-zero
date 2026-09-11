import {
  type Finding,
  type FindingListFilter,
  type FindingPage,
  type FindingRepository,
} from '@level-zero/domain';
import { and, count, desc, eq, inArray } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import { findings } from '../schema/findings';
import { toFinding, toFindingRow } from './mappers';

/**
 * Postgres adapter for the domain's `FindingRepository` port.
 *
 * `upsert` is the only way a scan writes. It is keyed on the table's unique
 * `(project_id, fingerprint)` index, and its `set` clause deliberately leaves
 * out `status`, `first_seen_at`, `resolved_at`, `dismissed_at`,
 * `dismissed_by` and `dismissed_reason` — the same way
 * `DrizzleSearchDocumentRepository.upsert` leaves out the embedding columns
 * to keep a vector re-indexing would otherwise discard. Here it is what makes
 * a dismissal survive every later scan (docs/decisions/consistency-findings.md
 * §3.2, §4.4).
 */
export class DrizzleFindingRepository implements FindingRepository {
  constructor(private readonly db: Database) {}

  async upsert(finding: Finding): Promise<Finding> {
    const row = toFindingRow(finding);

    const [saved] = await this.db
      .insert(findings)
      .values(row)
      .onConflictDoUpdate({
        target: [findings.projectId, findings.fingerprint],
        set: {
          checkId: row.checkId,
          origin: row.origin,
          generationId: row.generationId,
          severity: row.severity,
          summary: row.summary,
          evidence: row.evidence,
          lastSeenAt: row.lastSeenAt,
        },
      })
      .returning();

    if (!saved) throw new Error('Upsert returned no finding row');
    return toFinding(saved);
  }

  async findById(projectId: string, findingId: string): Promise<Finding | null> {
    const [row] = await this.db
      .select()
      .from(findings)
      .where(and(eq(findings.projectId, projectId), eq(findings.id, findingId)))
      .limit(1);

    return row ? toFinding(row) : null;
  }

  async listByProject(projectId: string, filter: FindingListFilter = {}): Promise<FindingPage> {
    const conditions = [eq(findings.projectId, projectId)];
    if (filter.statuses?.length) conditions.push(inArray(findings.status, [...filter.statuses]));
    if (filter.checkId) conditions.push(eq(findings.checkId, filter.checkId));
    const where = and(...conditions)!;

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(findings)
        .where(where)
        .orderBy(desc(findings.lastSeenAt), desc(findings.id))
        .limit(filter.limit ?? 50)
        .offset(filter.offset ?? 0),
      this.db.select({ value: count() }).from(findings).where(where),
    ]);

    return { items: rows.map(toFinding), total: totals?.value ?? 0 };
  }

  async save(finding: Finding): Promise<Finding> {
    const row = toFindingRow(finding);

    const [saved] = await this.db
      .update(findings)
      .set(row)
      .where(and(eq(findings.id, finding.id), eq(findings.projectId, finding.projectId)))
      .returning();

    if (!saved) throw new Error(`Finding ${finding.id} not found for project ${finding.projectId}`);
    return toFinding(saved);
  }
}
