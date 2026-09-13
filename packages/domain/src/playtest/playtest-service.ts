import { type ActivityService } from '../activity/activity-service';
import { type EntityService } from '../entity/entity-service';
import { type PrototypeVersionRepository } from '../prototype/prototype-version-repository';
import { type Clock } from '../shared/clock';
import { NotFoundError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { normalizePaging } from '../shared/paging';
import {
  applyPlaytestUpdate,
  createPlaytest,
  type Playtest,
  type PlaytestStatus,
  type UpdatePlaytestInput,
} from './playtest';
import {
  createPlaytestFeedback,
  type PlaytestFeedback,
  type PlaytestSentiment,
} from './playtest-feedback';
import {
  createPlaytestMetric,
  resolvePlaytestMetricKey,
  type PlaytestMetric,
} from './playtest-metric';
import { createPlaytestObservation, type PlaytestObservation } from './playtest-observation';
import {
  type PlaytestListFilter,
  type PlaytestPage,
  type PlaytestRepository,
} from './playtest-repository';
import { createPlaytestSession, type PlaytestSession } from './playtest-session';

export interface PlaytestServiceDeps {
  clock: Clock;
  ids: IdGenerator;
}

/** A playtest to create, pinned to an exact prototype version. */
export interface NewPlaytestInput {
  prototypeVersionId: string;
  name: string;
  goal?: string | null;
  status?: PlaytestStatus;
  summary?: string | null;
  tags?: string[];
  createdBy?: string | null;
}

export interface RecordPlaytestSessionInput {
  participant?: string | null;
  notes?: string | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
}

export interface RecordPlaytestObservationInput {
  sessionId?: string | null;
  entityId?: string | null;
  atSeconds?: number | null;
  body: string;
  tags?: string[];
  observedBy?: string | null;
}

export interface RecordPlaytestFeedbackInput {
  sessionId?: string | null;
  body: string;
  sentiment?: PlaytestSentiment | null;
  tags?: string[];
  author?: string | null;
}

export interface RecordPlaytestMetricInput {
  sessionId?: string | null;
  label: string;
  value: number;
  unit?: string | null;
}

/**
 * Evidence about a playtest of one exact `PrototypeVersion` — never a
 * snapshot of the version's own content, only a reference to it
 * (`docs/decisions/playtest-record-model.md` §5.2).
 *
 * Sessions, observations, feedback and metrics belong to one playtest and
 * have no life of their own, so this is where all four are recorded;
 * transport layers never reach for `PlaytestRepository` directly.
 */
export class PlaytestService {
  constructor(
    private readonly playtests: PlaytestRepository,
    private readonly prototypeVersions: PrototypeVersionRepository,
    private readonly entities: EntityService,
    private readonly activity: ActivityService,
    private readonly deps: PlaytestServiceDeps,
  ) {}

  /**
   * Creates a playtest pinned to an exact prototype version.
   *
   * The version is read through the project first, so a version id from
   * another project — or one that does not exist — fails as "not found"
   * before a playtest citing it ever exists. The database's composite
   * foreign key (§5.1) is the guarantee of record; this check only makes the
   * failure legible before it gets there.
   */
  async create(projectId: string, input: NewPlaytestInput): Promise<Playtest> {
    await this.requirePrototypeVersion(projectId, input.prototypeVersionId);
    return this.playtests.insert(createPlaytest({ ...input, projectId }, this.deps));
  }

  /** Throws `NotFoundError` rather than returning null: callers want the record. */
  async getById(projectId: string, playtestId: string): Promise<Playtest> {
    const playtest = await this.playtests.findById(projectId, playtestId);
    if (!playtest) throw new NotFoundError('Playtest', playtestId);
    return playtest;
  }

  async list(projectId: string, filter: PlaytestListFilter = {}): Promise<PlaytestPage> {
    const { limit, offset } = normalizePaging(filter.limit, filter.offset);
    return this.playtests.listByProject(projectId, { ...filter, limit, offset });
  }

  /**
   * Applying a patch is the only way a playtest reaches `complete`, so that
   * transition — and only that transition — records a `playtest_completed`
   * activity, the way `EntityService.archive` records its own. Updating an
   * already-complete playtest's summary or tags does not fire it again.
   */
  async update(
    projectId: string,
    playtestId: string,
    patch: UpdatePlaytestInput,
  ): Promise<Playtest> {
    const playtest = await this.getById(projectId, playtestId);
    const updated = await this.playtests.save(applyPlaytestUpdate(playtest, patch, this.deps));

    if (updated.status === 'complete' && playtest.status !== 'complete') {
      await this.activity.record({
        projectId,
        type: 'playtest_completed',
        summary: `${updated.name} completed`,
        subjectType: 'playtest',
        subjectId: updated.id,
        metadata: { prototypeVersionId: updated.prototypeVersionId },
        actor: updated.createdBy,
      });
    }

    return updated;
  }

  /** Numbers the session monotonically within the playtest, starting at 1. */
  async recordSession(
    projectId: string,
    playtestId: string,
    input: RecordPlaytestSessionInput,
  ): Promise<PlaytestSession> {
    await this.getById(projectId, playtestId);
    const sessionNumber = (await this.playtests.latestSessionNumber(projectId, playtestId)) + 1;

    return this.playtests.insertSession(
      createPlaytestSession({ ...input, projectId, playtestId, sessionNumber }, this.deps),
    );
  }

  async listSessions(projectId: string, playtestId: string): Promise<PlaytestSession[]> {
    await this.getById(projectId, playtestId);
    return this.playtests.listSessions(projectId, playtestId);
  }

  /**
   * Records what the team noticed. A `sessionId` must belong to this
   * playtest and an `entityId` must exist in this project — both checked
   * here so a mismatch fails as "not found" before the row is written, ahead
   * of the composite and restrict foreign keys that guarantee it either way.
   */
  async recordObservation(
    projectId: string,
    playtestId: string,
    input: RecordPlaytestObservationInput,
  ): Promise<PlaytestObservation> {
    await this.getById(projectId, playtestId);
    if (input.sessionId) await this.requireSession(projectId, playtestId, input.sessionId);
    if (input.entityId) await this.entities.getById(projectId, input.entityId);

    return this.playtests.insertObservation(
      createPlaytestObservation({ ...input, projectId, playtestId }, this.deps),
    );
  }

  async listObservations(projectId: string, playtestId: string): Promise<PlaytestObservation[]> {
    await this.getById(projectId, playtestId);
    return this.playtests.listObservations(projectId, playtestId);
  }

  /** Records a participant's own words, verbatim. */
  async recordFeedback(
    projectId: string,
    playtestId: string,
    input: RecordPlaytestFeedbackInput,
  ): Promise<PlaytestFeedback> {
    await this.getById(projectId, playtestId);
    if (input.sessionId) await this.requireSession(projectId, playtestId, input.sessionId);

    return this.playtests.insertFeedback(
      createPlaytestFeedback({ ...input, projectId, playtestId }, this.deps),
    );
  }

  async listFeedback(projectId: string, playtestId: string): Promise<PlaytestFeedback[]> {
    await this.getById(projectId, playtestId);
    return this.playtests.listFeedback(projectId, playtestId);
  }

  /**
   * Records one measurement. A label matching an existing metric on this
   * playtest reuses its `metricKey`, so repeated measurements of "session
   * duration" across sessions stay one metric to group and diff rather than
   * minting a new key per session.
   */
  async recordMetric(
    projectId: string,
    playtestId: string,
    input: RecordPlaytestMetricInput,
  ): Promise<PlaytestMetric> {
    await this.getById(projectId, playtestId);
    if (input.sessionId) await this.requireSession(projectId, playtestId, input.sessionId);

    const existing = await this.playtests.listMetrics(projectId, playtestId);
    const metricKey = resolvePlaytestMetricKey(input.label, existing);

    return this.playtests.insertMetric(
      createPlaytestMetric({ ...input, projectId, playtestId, metricKey }, this.deps),
    );
  }

  async listMetrics(projectId: string, playtestId: string): Promise<PlaytestMetric[]> {
    await this.getById(projectId, playtestId);
    return this.playtests.listMetrics(projectId, playtestId);
  }

  private async requirePrototypeVersion(
    projectId: string,
    prototypeVersionId: string,
  ): Promise<void> {
    const version = await this.prototypeVersions.findById(projectId, prototypeVersionId);
    if (!version) throw new NotFoundError('Prototype version', prototypeVersionId);
  }

  /** A mismatched playtest reads as missing, the same as a mismatched project elsewhere. */
  private async requireSession(
    projectId: string,
    playtestId: string,
    sessionId: string,
  ): Promise<PlaytestSession> {
    const session = await this.playtests.findSession(projectId, sessionId);
    if (!session || session.playtestId !== playtestId) {
      throw new NotFoundError('Playtest session', sessionId);
    }
    return session;
  }
}
