import { ValidationError } from './errors';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export interface NormalizedPaging {
  limit: number;
  offset: number;
}

/** Applies shared paging defaults and bounds so every adapter behaves alike. */
export function normalizePaging(limit?: number, offset?: number): NormalizedPaging {
  const resolvedLimit = limit ?? DEFAULT_PAGE_SIZE;
  const resolvedOffset = offset ?? 0;

  if (!Number.isInteger(resolvedLimit) || resolvedLimit < 1 || resolvedLimit > MAX_PAGE_SIZE) {
    throw new ValidationError(`limit must be an integer between 1 and ${MAX_PAGE_SIZE}`, {
      field: 'limit',
      received: limit,
    });
  }
  if (!Number.isInteger(resolvedOffset) || resolvedOffset < 0) {
    throw new ValidationError('offset must be an integer of 0 or more', {
      field: 'offset',
      received: offset,
    });
  }

  return { limit: resolvedLimit, offset: resolvedOffset };
}
