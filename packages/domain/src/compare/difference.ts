/**
 * The shared vocabulary of a comparison: what a reader is told changed.
 *
 * Every compare target — entity versions, tuning, prose, assets, prototype
 * versions — ends up as these rows, so one layout renders all of them and only
 * the *computing* of the rows is target-specific. Both sides are already
 * formatted for reading: `120 s`, `On`, `Playable`, never a raw stored value.
 */
export interface Difference {
  /** Stable within its group: a field path, a parameter id, a position. */
  key: string;
  label: string;
  change: DifferenceChange;
  /** Null where the thing did not exist, or held nothing, on that side. */
  from: string | null;
  to: string | null;
}

export type DifferenceChange = 'added' | 'removed' | 'changed';

/** Differences that belong together, e.g. `Details`, `Tuning`, `Writing`. */
export interface DifferenceGroup {
  title: string;
  differences: Difference[];
}

/** How much of a value a difference row carries before it is cut short. */
export const MAX_DIFFERENCE_VALUE_LENGTH = 240;

/** Which way a value moved, read from whether each side had one. */
export function changeOf(from: string | null, to: string | null): DifferenceChange {
  if (from === null) return 'added';
  if (to === null) return 'removed';
  return 'changed';
}

/**
 * A stored value as a reader sees it.
 *
 * `data` is schemaless, so this has to cope with anything: text, numbers,
 * switches, lists of tags, and the occasional nested object a feature keeps
 * its own way. Anything that has no readable form comes back as null, which
 * the row reads as "nothing on that side".
 */
export function describeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return truncate(value.trim()) || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const entries = value.filter(isReadable).map(String);
    return entries.length === value.length
      ? truncate(entries.join(', '))
      : count(value.length, 'item');
  }

  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length === 0 ? null : count(keys.length, 'field');
}

/** A field path as a heading: `data.implementationStatus` → `Implementation status`. */
export function fieldLabel(field: string): string {
  const name = field.startsWith('data.') ? field.slice('data.'.length) : field;
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, (_match, before: string, after: string) => {
      return `${before} ${after.toLowerCase()}`;
    })
    .replace(/[_-]+/g, ' ')
    .trim();

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Drops the rows a target found nothing to say about. */
export function compactDifferences(rows: readonly (Difference | null)[]): Difference[] {
  return rows.filter((row): row is Difference => row !== null);
}

/** One row, or nothing at all when the two sides agree. */
export function difference(
  key: string,
  label: string,
  from: string | null,
  to: string | null,
): Difference | null {
  if (from === to || (from === null && to === null)) return null;
  return { key, label, change: changeOf(from, to), from, to };
}

function isReadable(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function count(total: number, noun: string): string {
  return `${total} ${noun}${total === 1 ? '' : 's'}`;
}

function truncate(text: string): string {
  return text.length > MAX_DIFFERENCE_VALUE_LENGTH
    ? `${text.slice(0, MAX_DIFFERENCE_VALUE_LENGTH).trimEnd()}…`
    : text;
}
