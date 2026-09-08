/**
 * Time source. Domain code takes a `Clock` instead of calling `Date.now()` so
 * behaviour that depends on time stays deterministic under test.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** A clock that always reports the same instant. */
export function fixedClock(instant: Date | string): Clock {
  const value = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(value.getTime())) {
    throw new TypeError(`fixedClock received an invalid date: ${String(instant)}`);
  }
  return { now: () => new Date(value.getTime()) };
}
