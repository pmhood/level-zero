import { type EntitySnapshot } from '../entity/entity';
import { type EntityVersion } from './entity-version';

export interface FieldChange {
  /** `name`, `tags`, or `data.<key>` for a type-specific field. */
  field: string;
  from: unknown;
  to: unknown;
}

export interface VersionComparison {
  from: EntityVersion;
  to: EntityVersion;
  changes: FieldChange[];
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

/** Sorts object keys so field order does not read as a change. */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return value;
}

/**
 * Field-level differences between two snapshots.
 *
 * Type-specific data is compared key by key rather than as one blob, so a
 * history view can say "drainPerSecond changed" instead of "data changed".
 */
export function diffSnapshots(from: EntitySnapshot, to: EntitySnapshot): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const field of ['name', 'description', 'status', 'tags'] as const) {
    if (!equal(from[field], to[field])) {
      changes.push({ field, from: from[field], to: to[field] });
    }
  }

  const keys = [...new Set([...Object.keys(from.data), ...Object.keys(to.data)])].sort();
  for (const key of keys) {
    if (!equal(from.data[key], to.data[key])) {
      changes.push({ field: `data.${key}`, from: from.data[key], to: to.data[key] });
    }
  }

  return changes;
}

export function compareVersions(from: EntityVersion, to: EntityVersion): VersionComparison {
  return { from, to, changes: diffSnapshots(from.snapshot, to.snapshot) };
}
