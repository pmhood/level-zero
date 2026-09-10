import {
  ConflictError,
  NotFoundError,
  type Playtest,
  type PlaytestFeedback,
  type PlaytestListFilter,
  type PlaytestMetric,
  type PlaytestObservation,
  type PlaytestPage,
  type PlaytestRepository,
  type PlaytestSession,
} from '@level-zero/domain';
import { and, asc, count, desc, eq, sql, type SQL } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import {
  playtestFeedback,
  playtestMetrics,
  playtestObservations,
  playtests,
  playtestSessions,
} from '../schema/playtests';
import {
  toPlaytest,
  toPlaytestFeedback,
  toPlaytestFeedbackRow,
  toPlaytestMetric,
  toPlaytestMetricRow,
  toPlaytestObservation,
  toPlaytestObservationRow,
  toPlaytestRow,
  toPlaytestSession,
  toPlaytestSessionRow,
} from './mappers';
import { UNIQUE_VIOLATION, hasPostgresCode } from './postgres-errors';

/**
 * Postgres adapter for the domain's `PlaytestRepository` port.
 *
 * Bundles all five tables `docs/decisions/playtest-record-model.md` §9
 * sketches, the way `DrizzleMoodboardRepository` bundles nodes and
 * connectors: they are one aggregate, written and read by one service.
 */
export class DrizzlePlaytestRepository implements PlaytestRepository {
  constructor(private readonly db: Database) {}

  async insert(playtest: Playtest): Promise<Playtest> {
    const [row] = await this.db.insert(playtests).values(toPlaytestRow(playtest)).returning();
    if (!row) throw new Error('Insert returned no playtest row');
    return toPlaytest(row);
  }

  async findById(projectId: string, playtestId: string): Promise<Playtest | null> {
    const [row] = await this.db
      .select()
      .from(playtests)
      .where(and(eq(playtests.id, playtestId), eq(playtests.projectId, projectId)))
      .limit(1);

    return row ? toPlaytest(row) : null;
  }

  async listByProject(projectId: string, filter: PlaytestListFilter): Promise<PlaytestPage> {
    const where = buildPlaytestWhere(projectId, filter);

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(playtests)
        .where(where)
        .orderBy(desc(playtests.createdAt), desc(playtests.id))
        .limit(filter.limit ?? 50)
        .offset(filter.offset ?? 0),
      this.db.select({ value: count() }).from(playtests).where(where),
    ]);

    return { items: rows.map(toPlaytest), total: totals?.value ?? 0 };
  }

  async save(playtest: Playtest): Promise<Playtest> {
    const [row] = await this.db
      .update(playtests)
      .set(toPlaytestRow(playtest))
      .where(and(eq(playtests.id, playtest.id), eq(playtests.projectId, playtest.projectId)))
      .returning();

    if (!row) throw new NotFoundError('Playtest', playtest.id);
    return toPlaytest(row);
  }

  async insertSession(session: PlaytestSession): Promise<PlaytestSession> {
    try {
      const [row] = await this.db
        .insert(playtestSessions)
        .values(toPlaytestSessionRow(session))
        .returning();
      if (!row) throw new Error('Insert returned no playtest session row');
      return toPlaytestSession(row);
    } catch (error) {
      // Two sessions raced for the same number. The caller can retry.
      if (hasPostgresCode(error, UNIQUE_VIOLATION)) {
        throw new ConflictError('Another session was recorded at the same time; try again', {
          playtestId: session.playtestId,
          sessionNumber: session.sessionNumber,
        });
      }
      throw error;
    }
  }

  async findSession(projectId: string, sessionId: string): Promise<PlaytestSession | null> {
    const [row] = await this.db
      .select()
      .from(playtestSessions)
      .where(and(eq(playtestSessions.id, sessionId), eq(playtestSessions.projectId, projectId)))
      .limit(1);

    return row ? toPlaytestSession(row) : null;
  }

  async listSessions(projectId: string, playtestId: string): Promise<PlaytestSession[]> {
    const rows = await this.db
      .select()
      .from(playtestSessions)
      .where(
        and(eq(playtestSessions.projectId, projectId), eq(playtestSessions.playtestId, playtestId)),
      )
      .orderBy(asc(playtestSessions.sessionNumber));

    return rows.map(toPlaytestSession);
  }

  async latestSessionNumber(projectId: string, playtestId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: playtestSessions.sessionNumber })
      .from(playtestSessions)
      .where(
        and(eq(playtestSessions.projectId, projectId), eq(playtestSessions.playtestId, playtestId)),
      )
      .orderBy(desc(playtestSessions.sessionNumber))
      .limit(1);

    return row?.value ?? 0;
  }

  async insertObservation(observation: PlaytestObservation): Promise<PlaytestObservation> {
    const [row] = await this.db
      .insert(playtestObservations)
      .values(toPlaytestObservationRow(observation))
      .returning();
    if (!row) throw new Error('Insert returned no playtest observation row');
    return toPlaytestObservation(row);
  }

  async listObservations(projectId: string, playtestId: string): Promise<PlaytestObservation[]> {
    const rows = await this.db
      .select()
      .from(playtestObservations)
      .where(
        and(
          eq(playtestObservations.projectId, projectId),
          eq(playtestObservations.playtestId, playtestId),
        ),
      )
      .orderBy(asc(playtestObservations.createdAt));

    return rows.map(toPlaytestObservation);
  }

  async insertFeedback(feedback: PlaytestFeedback): Promise<PlaytestFeedback> {
    const [row] = await this.db
      .insert(playtestFeedback)
      .values(toPlaytestFeedbackRow(feedback))
      .returning();
    if (!row) throw new Error('Insert returned no playtest feedback row');
    return toPlaytestFeedback(row);
  }

  async listFeedback(projectId: string, playtestId: string): Promise<PlaytestFeedback[]> {
    const rows = await this.db
      .select()
      .from(playtestFeedback)
      .where(
        and(eq(playtestFeedback.projectId, projectId), eq(playtestFeedback.playtestId, playtestId)),
      )
      .orderBy(asc(playtestFeedback.createdAt));

    return rows.map(toPlaytestFeedback);
  }

  async insertMetric(metric: PlaytestMetric): Promise<PlaytestMetric> {
    try {
      const [row] = await this.db
        .insert(playtestMetrics)
        .values(toPlaytestMetricRow(metric))
        .returning();
      if (!row) throw new Error('Insert returned no playtest metric row');
      return toPlaytestMetric(row);
    } catch (error) {
      // Two measurements raced for the same key on the same run. The caller
      // can retry.
      if (hasPostgresCode(error, UNIQUE_VIOLATION)) {
        throw new ConflictError('That metric was already recorded for this run; try again', {
          playtestId: metric.playtestId,
          sessionId: metric.sessionId,
          metricKey: metric.metricKey,
        });
      }
      throw error;
    }
  }

  async listMetrics(projectId: string, playtestId: string): Promise<PlaytestMetric[]> {
    const rows = await this.db
      .select()
      .from(playtestMetrics)
      .where(
        and(eq(playtestMetrics.projectId, projectId), eq(playtestMetrics.playtestId, playtestId)),
      )
      .orderBy(asc(playtestMetrics.createdAt));

    return rows.map(toPlaytestMetric);
  }
}

function buildPlaytestWhere(projectId: string, filter: PlaytestListFilter): SQL {
  const conditions: SQL[] = [eq(playtests.projectId, projectId)];

  if (filter.prototypeVersionId) {
    conditions.push(eq(playtests.prototypeVersionId, filter.prototypeVersionId));
  }

  const tags = filter.tags?.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0);
  if (tags?.length) {
    // Tags keep the casing the user typed, so matching lowercases both sides.
    // The list is joined explicitly: a bare array would be interpolated as a
    // Postgres array literal, which `in (...)` does not accept.
    const wanted = sql.join(
      tags.map((tag) => sql`${tag}`),
      sql`, `,
    );
    conditions.push(
      sql`exists (select 1 from unnest(${playtests.tags}) as tag where lower(tag) in (${wanted}))`,
    );
  }

  return and(...conditions) as SQL;
}
