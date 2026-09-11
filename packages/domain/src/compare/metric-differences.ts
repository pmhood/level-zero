import { type PlaytestMetric } from '../playtest/playtest-metric';
import { type Difference } from './difference';

/** The unit that renders without a space, the way a percentage parameter does. */
const PERCENT_UNIT = '%';

/**
 * Every measurement recorded under one `metricKey`, on one side, as one number.
 *
 * Aggregation is computed on read and never stored
 * (`docs/decisions/playtest-record-model.md` §7): a stored mean goes stale the
 * moment a session is added. `sampleCount` travels with the mean because two
 * sides of a comparison rarely measured the same number of times, and a
 * difference read without it says more than the evidence does.
 */
export interface MetricSummary {
  metricKey: string;
  /** As entered on the first measurement; `metricKey` is the identity. */
  label: string;
  /** `s`, `%`, `m/s`, ... — `Parameter.units`' convention. */
  unit: string | null;
  mean: number;
  /** How many measurements the mean was taken over. */
  sampleCount: number;
  /** The playtests the measurements came from, so a number can be followed back. */
  playtestIds: string[];
}

/**
 * Collapses a side's measurements into one summary per metric.
 *
 * Keyed on `metricKey` rather than the label, so "session duration" measured
 * across five sessions of two playtests is one summary — which is the whole
 * reason `resolvePlaytestMetricKey` reuses a key for a repeated label.
 */
export function summarizeMetrics(metrics: readonly PlaytestMetric[]): MetricSummary[] {
  const summaries = new Map<string, MetricSummary>();
  const totals = new Map<string, number>();

  for (const metric of metrics) {
    const existing = summaries.get(metric.metricKey);
    const total = (totals.get(metric.metricKey) ?? 0) + metric.value;
    totals.set(metric.metricKey, total);

    if (!existing) {
      summaries.set(metric.metricKey, {
        metricKey: metric.metricKey,
        label: metric.label,
        unit: metric.unit,
        mean: metric.value,
        sampleCount: 1,
        playtestIds: [metric.playtestId],
      });
      continue;
    }

    existing.sampleCount += 1;
    existing.mean = total / existing.sampleCount;
    if (!existing.playtestIds.includes(metric.playtestId)) {
      existing.playtestIds.push(metric.playtestId);
    }
  }

  return [...summaries.values()];
}

/** A measured number as a reader sees it: `90 s`, `73.5%`, `12`. */
export function formatMetricValue(summary: MetricSummary): string {
  const value = String(Math.round(summary.mean * 100) / 100);
  if (!summary.unit) return value;
  return summary.unit === PERCENT_UNIT ? `${value}${PERCENT_UNIT}` : `${value} ${summary.unit}`;
}

/**
 * What moved between two sides' measurements.
 *
 * The shape `parameterDifferences` already uses, for the same reason: metrics
 * are matched on the stable key minted from their label, so a designer reads
 * `120 s → 90 s` rather than one list of numbers replacing another, and the
 * "Design changes" and "Metric changes" sections render from one row type.
 *
 * A metric measured on only one side is an addition or a removal, not a move —
 * a side that stopped measuring completion rate has not improved it.
 */
export function metricDifferences(
  from: readonly MetricSummary[],
  to: readonly MetricSummary[],
): Difference[] {
  const before = new Map(from.map((summary) => [summary.metricKey, summary]));
  const after = new Map(to.map((summary) => [summary.metricKey, summary]));
  const differences: Difference[] = [];

  for (const summary of to) {
    const previous = before.get(summary.metricKey);

    if (!previous) {
      differences.push({
        key: summary.metricKey,
        label: summary.label,
        change: 'added',
        from: null,
        to: formatMetricValue(summary),
      });
      continue;
    }

    const fromValue = formatMetricValue(previous);
    const toValue = formatMetricValue(summary);
    if (fromValue === toValue) continue;

    differences.push({
      key: summary.metricKey,
      label: summary.label,
      change: 'changed',
      from: fromValue,
      to: toValue,
    });
  }

  for (const summary of from) {
    if (after.has(summary.metricKey)) continue;
    differences.push({
      key: summary.metricKey,
      label: summary.label,
      change: 'removed',
      from: formatMetricValue(summary),
      to: null,
    });
  }

  return differences;
}
