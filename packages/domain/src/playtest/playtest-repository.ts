import { type Playtest } from './playtest';
import { type PlaytestFeedback } from './playtest-feedback';
import { type PlaytestMetric } from './playtest-metric';
import { type PlaytestObservation } from './playtest-observation';
import { type PlaytestSession } from './playtest-session';

export interface PlaytestListFilter {
  /** Matches playtests carrying *any* of these tags (case-insensitive). */
  tags?: readonly string[];
  limit?: number;
  offset?: number;
}

export interface PlaytestPage {
  items: Playtest[];
  /** Total matching rows, ignoring `limit`/`offset`. */
  total: number;
}

/**
 * Storage port for playtests and everything recorded under them.
 *
 * All five concepts are evidence about a `PrototypeVersion`, not entities
 * (`docs/decisions/playtest-record-model.md` §3), so they share one port the
 * way `MoodboardRepository` bundles nodes and connectors: one aggregate,
 * written and read by one service. Sessions, observations, feedback and
 * metrics are written once and read back — only the playtest itself is ever
 * annotated after creation.
 *
 * Every method is scoped by `projectId`, so an id from another project reads
 * as missing rather than forbidden.
 */
export interface PlaytestRepository {
  insert(playtest: Playtest): Promise<Playtest>;
  findById(projectId: string, playtestId: string): Promise<Playtest | null>;
  listByProject(projectId: string, filter: PlaytestListFilter): Promise<PlaytestPage>;
  save(playtest: Playtest): Promise<Playtest>;

  insertSession(session: PlaytestSession): Promise<PlaytestSession>;
  findSession(projectId: string, sessionId: string): Promise<PlaytestSession | null>;
  listSessions(projectId: string, playtestId: string): Promise<PlaytestSession[]>;
  /** Highest `sessionNumber` recorded for the playtest, or 0 when it has none. */
  latestSessionNumber(projectId: string, playtestId: string): Promise<number>;

  insertObservation(observation: PlaytestObservation): Promise<PlaytestObservation>;
  listObservations(projectId: string, playtestId: string): Promise<PlaytestObservation[]>;

  insertFeedback(feedback: PlaytestFeedback): Promise<PlaytestFeedback>;
  listFeedback(projectId: string, playtestId: string): Promise<PlaytestFeedback[]>;

  insertMetric(metric: PlaytestMetric): Promise<PlaytestMetric>;
  listMetrics(projectId: string, playtestId: string): Promise<PlaytestMetric[]>;
}
