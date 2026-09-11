import { type PlaytestRepository } from '../playtest/playtest-repository';
import { type PrototypeService } from '../prototype/prototype-service';
import { MAX_PAGE_SIZE } from '../shared/paging';
import {
  compareOutcomes,
  type OutcomeComparison,
  type PlaytestEvidence,
} from './outcome-comparison';

/**
 * Two prototype versions, what changed between them, and what the playtests of
 * each one measured.
 *
 * It owns no storage. A prototype version's pins are already immutable and its
 * playtests already name the exact version they were evidence about, so this is
 * a *reading* over both — which is why the answer to "what changed between v3
 * and v4" cannot drift as the entities move on.
 *
 * Kept apart from `PlaytestService` and `PrototypeService` because it is a
 * third responsibility: neither of those two services knows about the other's
 * records, and neither should start to.
 */
export class OutcomeComparisonService {
  constructor(
    private readonly prototypes: PrototypeService,
    private readonly playtests: PlaytestRepository,
  ) {}

  /**
   * Compares two versions of the same prototype.
   *
   * `PrototypeService.compare` is what rejects a pair from two different
   * prototypes and a version that does not exist, so the assembly below only
   * ever runs over a pair worth comparing.
   */
  async compare(
    projectId: string,
    fromVersionId: string,
    toVersionId: string,
  ): Promise<OutcomeComparison> {
    const comparison = await this.prototypes.compare(projectId, fromVersionId, toVersionId);

    const [fromContents, toContents] = await Promise.all([
      this.prototypes.contents(projectId, fromVersionId),
      this.prototypes.contents(projectId, toVersionId),
    ]);
    const [fromEvidence, toEvidence] = await Promise.all([
      this.evidence(projectId, fromVersionId),
      this.evidence(projectId, toVersionId),
    ]);

    return compareOutcomes(
      comparison,
      [...fromContents.entityVersions, ...toContents.entityVersions],
      fromEvidence,
      toEvidence,
    );
  }

  /**
   * Everything recorded about one version's playtests.
   *
   * A version nobody played comes back empty rather than failing: "no
   * playtests yet" is an answer the comparison has to be able to give, and it
   * is the common case for the newer of the two versions.
   */
  private async evidence(projectId: string, prototypeVersionId: string): Promise<PlaytestEvidence> {
    const { items } = await this.playtests.listByProject(projectId, {
      prototypeVersionId,
      limit: MAX_PAGE_SIZE,
      offset: 0,
    });

    const evidence: PlaytestEvidence = {
      playtests: items,
      sessions: [],
      metrics: [],
      feedback: [],
      observations: [],
    };

    for (const playtest of items) {
      const [sessions, metrics, feedback, observations] = await Promise.all([
        this.playtests.listSessions(projectId, playtest.id),
        this.playtests.listMetrics(projectId, playtest.id),
        this.playtests.listFeedback(projectId, playtest.id),
        this.playtests.listObservations(projectId, playtest.id),
      ]);

      evidence.sessions.push(...sessions);
      evidence.metrics.push(...metrics);
      evidence.feedback.push(...feedback);
      evidence.observations.push(...observations);
    }

    return evidence;
  }
}
