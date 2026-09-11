import {
  type Difference,
  type DifferenceChange,
  type DifferenceGroup,
} from '../compare/difference';
import { entityVersionDifferences } from '../compare/entity-differences';
import {
  metricDifferences,
  summarizeMetrics,
  type MetricSummary,
} from '../compare/metric-differences';
import { type PlaytestFeedback } from '../playtest/playtest-feedback';
import { type PlaytestMetric } from '../playtest/playtest-metric';
import { type PlaytestObservation } from '../playtest/playtest-observation';
import { type Playtest } from '../playtest/playtest';
import { type PlaytestSession } from '../playtest/playtest-session';
import { type PrototypeMemberChange, type PrototypeVersionComparison } from '../prototype/compare';
import { type PrototypeVersion } from '../prototype/prototype-version';
import { type EntityVersion } from '../version/entity-version';

/** One pinned entity version, named the way a reader recognises it. */
export interface PinnedEntityVersion {
  entityVersionId: string;
  versionNumber: number;
}

/**
 * One entity, as it differs between the two prototype versions.
 *
 * `groups` is the field-level reading of the two pinned snapshots, so a
 * mechanic's tuning arrives as `120 s → 90 s` under `Tuning` rather than as
 * "data changed" — `entityVersionDifferences` already hands tuning to
 * `parameterDifferences`, which matches on the stable parameter id. An entity
 * that was added or removed has nothing to diff and carries no groups.
 */
export interface DesignChange {
  entityId: string;
  /** From the pinned snapshot, falling back to the id if neither resolved. */
  name: string;
  change: DifferenceChange;
  /** Null on the side the entity was not in, or whose pin did not resolve. */
  from: PinnedEntityVersion | null;
  to: PinnedEntityVersion | null;
  groups: DifferenceGroup[];
}

/** One metric, measured on either side, with the evidence behind each number. */
export interface MetricChange {
  /** Both sides already formatted: `120 s → 90 s`. */
  difference: Difference;
  from: MetricSummary | null;
  to: MetricSummary | null;
}

/**
 * One category of qualitative evidence, either side of the change.
 *
 * The raw rows are kept, not summarised: a theme is a way into the prose, and
 * the prose is the record. `category` is `null` for the rows that were never
 * tagged, following `ParameterGroup`'s convention for the same situation. A
 * theme with nothing on the `from` side is what "a new complaint appeared"
 * looks like.
 */
export interface CategoryGroup<TItem> {
  category: string | null;
  from: TItem[];
  to: TItem[];
}

/** Everything recorded about the playtests of one prototype version. */
export interface PlaytestEvidence {
  playtests: Playtest[];
  sessions: PlaytestSession[];
  metrics: PlaytestMetric[];
  feedback: PlaytestFeedback[];
  observations: PlaytestObservation[];
}

/** One prototype version, and what the playtests of it measured. */
export interface OutcomeSide {
  version: PrototypeVersion;
  /** Playtests pinned to this exact version. Empty when it was never played. */
  playtests: Playtest[];
  /** The runs behind the metrics — the sample, stated rather than implied. */
  sessionCount: number;
  metrics: MetricSummary[];
}

/**
 * What changed between two prototype versions, beside what the playtests of
 * each one measured.
 *
 * Every field here is an observed fact: pinned versions, tuning values,
 * measured numbers and the words people wrote. Nothing correlates them and
 * nothing claims a cause — a model's reading of this is a `Generation`
 * recorded separately and labelled as interpretation.
 */
export interface OutcomeComparison {
  from: OutcomeSide;
  to: OutcomeSide;
  designChanges: DesignChange[];
  metricChanges: MetricChange[];
  feedbackThemes: CategoryGroup<PlaytestFeedback>[];
  observationThemes: CategoryGroup<PlaytestObservation>[];
}

/**
 * Assembles the comparison from facts already read.
 *
 * Pure on purpose: the service around it does the fetching, so what is
 * reported can be tested against hand-built evidence — including the awkward
 * shapes, like a version nobody played and two sides measured a different
 * number of times.
 */
export function compareOutcomes(
  comparison: PrototypeVersionComparison,
  pinned: readonly EntityVersion[],
  from: PlaytestEvidence,
  to: PlaytestEvidence,
): OutcomeComparison {
  return {
    from: outcomeSide(comparison.from, from),
    to: outcomeSide(comparison.to, to),
    designChanges: designChanges(comparison, pinned),
    metricChanges: metricChanges(from.metrics, to.metrics),
    feedbackThemes: groupByCategory(from.feedback, to.feedback),
    observationThemes: groupByCategory(from.observations, to.observations),
  };
}

function outcomeSide(version: PrototypeVersion, evidence: PlaytestEvidence): OutcomeSide {
  return {
    version,
    playtests: evidence.playtests,
    sessionCount: evidence.sessions.length,
    metrics: summarizeMetrics(evidence.metrics),
  };
}

/**
 * The added, changed and removed entities, in that order — what was brought in
 * first, since that is what a designer reaches for after capturing a version.
 */
function designChanges(
  comparison: PrototypeVersionComparison,
  pinned: readonly EntityVersion[],
): DesignChange[] {
  const versions = new Map(pinned.map((version) => [version.id, version]));

  return [...comparison.added, ...comparison.changed, ...comparison.removed].map((member) =>
    designChange(member, versions),
  );
}

function designChange(
  member: PrototypeMemberChange,
  versions: ReadonlyMap<string, EntityVersion>,
): DesignChange {
  const from = member.from === null ? null : (versions.get(member.from) ?? null);
  const to = member.to === null ? null : (versions.get(member.to) ?? null);

  return {
    entityId: member.entityId,
    name: to?.snapshot.name ?? from?.snapshot.name ?? member.entityId,
    change: member.from === null ? 'added' : member.to === null ? 'removed' : 'changed',
    from: from && { entityVersionId: from.id, versionNumber: from.versionNumber },
    to: to && { entityVersionId: to.id, versionNumber: to.versionNumber },
    // Both sides have to have resolved for there to be anything to read: a pin
    // that no longer resolves keeps its row and says so, rather than reporting
    // a diff against nothing.
    groups: from && to ? entityVersionDifferences(from.snapshot, to.snapshot) : [],
  };
}

/** Pairs each difference with the summaries behind it, so a number stays traceable. */
function metricChanges(
  from: readonly PlaytestMetric[],
  to: readonly PlaytestMetric[],
): MetricChange[] {
  const before = new Map(summarizeMetrics(from).map((summary) => [summary.metricKey, summary]));
  const after = new Map(summarizeMetrics(to).map((summary) => [summary.metricKey, summary]));

  return metricDifferences([...before.values()], [...after.values()]).map((difference) => ({
    difference,
    from: before.get(difference.key) ?? null,
    to: after.get(difference.key) ?? null,
  }));
}

/**
 * Splits both sides' rows by the tags they carry, busiest theme first.
 *
 * A row tagged twice appears under both categories: a tag is how someone
 * filed a remark, not a partition of the evidence. Untagged rows come last,
 * under `null`, rather than being dropped.
 */
function groupByCategory<TItem extends { tags: string[] }>(
  from: readonly TItem[],
  to: readonly TItem[],
): CategoryGroup<TItem>[] {
  const groups = new Map<string | null, CategoryGroup<TItem>>();

  const file = (items: readonly TItem[], side: 'from' | 'to') => {
    for (const item of items) {
      for (const category of item.tags.length > 0 ? item.tags : [null]) {
        const group = groups.get(category) ?? { category, from: [], to: [] };
        group[side].push(item);
        groups.set(category, group);
      }
    }
  };

  file(from, 'from');
  file(to, 'to');

  return [...groups.values()].sort(byVolumeThenName);
}

function byVolumeThenName<TItem>(a: CategoryGroup<TItem>, b: CategoryGroup<TItem>): number {
  if (a.category === null) return 1;
  if (b.category === null) return -1;

  const size = b.from.length + b.to.length - (a.from.length + a.to.length);
  return size !== 0 ? size : a.category.localeCompare(b.category);
}
