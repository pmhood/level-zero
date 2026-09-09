import { ValidationError } from './errors';

/**
 * Trims and validates a required text field.
 *
 * Whitespace-only input is rejected rather than silently stored, so a name is
 * always something a user can see in a list.
 */
export function requireText(field: string, value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`, { field, received: typeof value });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${field} must not be empty`, { field });
  }
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${field} must be at most ${maxLength} characters`, {
      field,
      maxLength,
      actual: trimmed.length,
    });
  }
  return trimmed;
}

/** Trims an optional text field, collapsing empty strings to `null`. */
export function optionalText(field: string, value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string or null`, {
      field,
      received: typeof value,
    });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${field} must be at most ${maxLength} characters`, {
      field,
      maxLength,
      actual: trimmed.length,
    });
  }
  return trimmed;
}

export const MAX_TAGS = 50;
export const MAX_TAG_LENGTH = 50;

/**
 * Normalises a tag list: trims, drops empties, and removes case-insensitive
 * duplicates while keeping the first spelling the user typed.
 */
export function normalizeTags(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ValidationError('tags must be an array of strings', { field: 'tags' });
  }

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const raw of value) {
    if (typeof raw !== 'string') {
      throw new ValidationError('tags must be an array of strings', { field: 'tags' });
    }
    const tag = raw.trim();
    if (tag.length === 0) continue;
    if (tag.length > MAX_TAG_LENGTH) {
      throw new ValidationError(`each tag must be at most ${MAX_TAG_LENGTH} characters`, {
        field: 'tags',
        tag,
      });
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }

  if (tags.length > MAX_TAGS) {
    throw new ValidationError(`at most ${MAX_TAGS} tags are allowed`, {
      field: 'tags',
      actual: tags.length,
    });
  }
  return tags;
}

/**
 * Validates free-form, type-specific structured data.
 *
 * Entities keep their type-specific fields in one JSON document so early
 * experiments can change shape without a migration. The only rule here is that
 * it must be a JSON object, which is what the storage column can hold.
 */
export function requireJsonObject(field: string, value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${field} must be an object`, { field });
  }

  try {
    JSON.stringify(value);
  } catch {
    throw new ValidationError(`${field} must be JSON-serialisable`, { field });
  }
  return { ...(value as Record<string, unknown>) };
}

/** Requires a whole number of zero or more, e.g. a byte size. */
export function requireNonNegativeInt(field: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ValidationError(`${field} must be a non-negative integer`, {
      field,
      received: value,
    });
  }
  return value;
}

/** An optional whole number greater than zero, e.g. pixel dimensions. Null/undefined pass through. */
export function optionalPositiveInt(field: string, value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${field} must be a positive integer`, {
      field,
      received: value,
    });
  }
  return value;
}

/** An optional number of zero or more, e.g. a duration in seconds. Null/undefined pass through. */
export function optionalNonNegativeNumber(field: string, value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ValidationError(`${field} must be a non-negative number`, {
      field,
      received: value,
    });
  }
  return value;
}

/** Rejects a value that is not one of `allowed`. */
export function requireOneOf<T extends string>(
  field: string,
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(', ')}`, {
      field,
      received: value,
      allowed,
    });
  }
  return value as T;
}
