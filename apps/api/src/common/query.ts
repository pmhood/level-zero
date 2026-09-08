/**
 * Query strings can express a list as `?tag=a&tag=b` or `?tag=a,b`. Both are
 * accepted and normalised to an array.
 */
export function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;

  const raw = Array.isArray(value) ? value : [value];
  const items = raw
    .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : [entry]))
    .map((entry) => (typeof entry === 'string' ? entry.trim() : entry))
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);

  return items.length > 0 ? items : undefined;
}

/** Parses `?includeArchived=true`. Anything other than `true`/`1` is false. */
export function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  return value === 'true' || value === '1';
}
