import { describe, expect, it } from 'vitest';

import { fixedClock, systemClock } from './clock';
import {
  ConflictError,
  DomainError,
  NotFoundError,
  ValidationError,
  isDomainError,
} from './errors';
import { sequentialIdGenerator, uuidIdGenerator } from './id';

describe('clock', () => {
  it('systemClock returns the current time', () => {
    const before = Date.now();
    const now = systemClock.now().getTime();

    expect(now).toBeGreaterThanOrEqual(before);
  });

  it('fixedClock always reports the same instant', () => {
    const clock = fixedClock('2026-01-01T00:00:00.000Z');

    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('fixedClock hands out copies so callers cannot mutate it', () => {
    const clock = fixedClock('2026-01-01T00:00:00.000Z');
    const first = clock.now();
    first.setFullYear(1999);

    expect(clock.now().getUTCFullYear()).toBe(2026);
  });

  it('fixedClock rejects an invalid date', () => {
    expect(() => fixedClock('not-a-date')).toThrow(TypeError);
  });
});

describe('id generators', () => {
  it('uuidIdGenerator produces unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => uuidIdGenerator.next()));

    expect(ids.size).toBe(100);
  });

  it('sequentialIdGenerator is predictable', () => {
    const ids = sequentialIdGenerator('entity');

    expect([ids.next(), ids.next(), ids.next()]).toEqual(['entity-1', 'entity-2', 'entity-3']);
  });
});

describe('domain errors', () => {
  it('exposes a stable code and structured details', () => {
    const error = new NotFoundError('Project', 'p-1');

    expect(error.code).toBe('not_found');
    expect(error.name).toBe('NotFoundError');
    expect(error.message).toBe('Project p-1 was not found');
    expect(error.details).toEqual({ resource: 'Project', id: 'p-1' });
  });

  it('freezes details so callers cannot mutate them', () => {
    const error = new ValidationError('bad input', { field: 'name' });

    expect(() => {
      (error.details as Record<string, unknown>).field = 'other';
    }).toThrow();
  });

  it('is recognisable through isDomainError', () => {
    expect(isDomainError(new ConflictError('duplicate'))).toBe(true);
    expect(isDomainError(new Error('boom'))).toBe(false);
    expect(new ConflictError('duplicate')).toBeInstanceOf(DomainError);
  });
});
