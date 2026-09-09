import { describe, expect, it } from 'vitest';

import { overallTone, toDependencyRows, type HealthReport } from './health';

const report: HealthReport = {
  status: 'error',
  service: 'level-zero-api',
  timestamp: '2026-02-01T12:00:00.000Z',
  checks: {
    postgres: { status: 'up', latencyMs: 4, details: { appliedMigrations: 1 } },
    redis: { status: 'down', latencyMs: 12, error: 'ECONNREFUSED' },
  },
};

describe('toDependencyRows', () => {
  it('renders latency and migration count for a healthy dependency', () => {
    const rows = toDependencyRows(report);

    expect(rows[0]).toEqual({
      name: 'postgres',
      tone: 'success',
      label: 'up',
      detail: '4ms · 1 migrations',
    });
  });

  it('surfaces the error message for a failing dependency', () => {
    expect(toDependencyRows(report)[1]).toMatchObject({ tone: 'error', detail: 'ECONNREFUSED' });
  });

  it('falls back when a failing dependency reports no error message', () => {
    const rows = toDependencyRows({
      ...report,
      checks: { redis: { status: 'down', latencyMs: 1 } },
    });

    expect(rows[0]?.detail).toBe('unavailable');
  });

  it('omits the migration suffix when the detail is absent', () => {
    const rows = toDependencyRows({
      ...report,
      checks: { redis: { status: 'up', latencyMs: 7 } },
    });

    expect(rows[0]?.detail).toBe('7ms');
  });

  it('returns nothing while the report is still loading', () => {
    expect(toDependencyRows(undefined)).toEqual([]);
  });
});

describe('overallTone', () => {
  it('is neutral before the first response', () => {
    expect(overallTone(undefined)).toBe('neutral');
  });

  it('is error when the request itself failed', () => {
    expect(overallTone(undefined, true)).toBe('error');
  });

  it('mirrors the reported status', () => {
    expect(overallTone(report)).toBe('error');
    expect(overallTone({ ...report, status: 'ok' })).toBe('success');
  });
});
