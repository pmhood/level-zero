import { describe, expect, it } from 'vitest';

import { measureCheck } from './health';

describe('measureCheck', () => {
  it('reports up and includes returned details', async () => {
    const result = await measureCheck(async () => ({ appliedMigrations: 3 }));

    expect(result.status).toBe('up');
    expect(result.details).toEqual({ appliedMigrations: 3 });
    expect(result.error).toBeUndefined();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('omits details when the probe returns nothing', async () => {
    const result = await measureCheck(async () => undefined);

    expect(result).toMatchObject({ status: 'up' });
    expect(result.details).toBeUndefined();
  });

  it('converts a thrown error into a down result instead of rejecting', async () => {
    const result = await measureCheck(async () => {
      throw new Error('connection refused');
    });

    expect(result.status).toBe('down');
    expect(result.error).toBe('connection refused');
  });

  it('stringifies non-Error throwables', async () => {
    const result = await measureCheck(async () => {
      throw 'ECONNREFUSED';
    });

    expect(result).toMatchObject({ status: 'down', error: 'ECONNREFUSED' });
  });
});
