import { parameterId } from '../parameter/parameter';
import { type Clock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { optionalText, requireText } from '../shared/validation';

export const MAX_PLAYTEST_METRIC_LABEL_LENGTH = 200;
export const MAX_PLAYTEST_METRIC_UNIT_LENGTH = 50;

/**
 * One measurement recorded during or about a playtest.
 *
 * `docs/decisions/playtest-record-model.md` §7 decides this is deliberately
 * not a `Parameter`: a metric is a number with a unit, and `Parameter`'s
 * bounds, clamping and validation describe a control's affordances, which a
 * measurement does not have — you cannot clamp an observed number into
 * range. What is reused is the id discipline (`metricKey` is minted with the
 * same `parameterId()`, see `resolvePlaytestMetricKey`) and the `units`
 * convention, so `120 s → 90 s` renders the way a tuning value does. There is
 * no `parameterId` column: correlating a metric with a tuning parameter is
 * #65's job, not a relationship this row declares.
 *
 * `sessionId` set means a per-run measurement; null means a playtest-level
 * figure. Aggregation across a playtest's sessions is computed on read,
 * never stored here — a stored aggregate goes stale the moment a session is
 * added.
 */
export interface PlaytestMetric {
  id: string;
  projectId: string;
  playtestId: string;
  sessionId: string | null;
  /** Stable identity, minted from `label` by `resolvePlaytestMetricKey`. */
  metricKey: string;
  /** As entered; `metricKey` is the identity. */
  label: string;
  value: number;
  /** `s`, `%`, `m/s`, ... — same convention as `Parameter.units`. */
  unit: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePlaytestMetricInput {
  projectId: string;
  playtestId: string;
  sessionId?: string | null;
  /** Resolved by the service, via `resolvePlaytestMetricKey`. */
  metricKey: string;
  label: string;
  value: number;
  unit?: string | null;
}

export interface PlaytestMetricFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createPlaytestMetric(
  input: CreatePlaytestMetricInput,
  deps: PlaytestMetricFactoryDeps,
): PlaytestMetric {
  const now = deps.clock.now();

  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    playtestId: requireText('playtestId', input.playtestId, 200),
    sessionId: optionalText('sessionId', input.sessionId, 200),
    metricKey: requireText('metricKey', input.metricKey, 200),
    label: requireText('label', input.label, MAX_PLAYTEST_METRIC_LABEL_LENGTH),
    value: requireFiniteNumber('value', input.value),
    unit: optionalText('unit', input.unit, MAX_PLAYTEST_METRIC_UNIT_LENGTH),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Resolves the stable key a new metric measurement should be recorded under.
 *
 * A label matching one already used by this playtest (case-insensitively)
 * reuses its key, so repeated measurements of "session duration" across
 * several sessions stay one metric to group and diff — the
 * `(playtest_id, metric_key)` index exists for exactly this. A genuinely new
 * label mints a fresh key with `parameterId`, avoiding collision with keys
 * already in use.
 */
export function resolvePlaytestMetricKey(
  label: string,
  existing: readonly Pick<PlaytestMetric, 'label' | 'metricKey'>[],
): string {
  const wanted = label.trim().toLowerCase();
  const reused = existing.find((metric) => metric.label.trim().toLowerCase() === wanted);
  if (reused) return reused.metricKey;

  const taken = [...new Set(existing.map((metric) => metric.metricKey))];
  return parameterId(label, taken);
}

function requireFiniteNumber(field: string, value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a finite number`, { field, received: value });
  }
  return value;
}
