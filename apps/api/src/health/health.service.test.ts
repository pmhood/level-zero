import { type DependencyCheckResult } from '@level-zero/database';
import { fixedClock } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import { HealthService } from './health.service';
import { type HealthProbe } from './health.types';

const clock = fixedClock('2026-02-01T12:00:00.000Z');

function probe(name: string, result: DependencyCheckResult): HealthProbe {
  return { name, check: async () => result };
}

const up: DependencyCheckResult = { status: 'up', latencyMs: 2 };
const down: DependencyCheckResult = { status: 'down', latencyMs: 5, error: 'connection refused' };

describe('HealthService.liveness', () => {
  it('reports ok without touching dependencies', () => {
    const neverCalled: HealthProbe = {
      name: 'postgres',
      check: () => {
        throw new Error('liveness must not probe dependencies');
      },
    };
    const service = new HealthService([neverCalled], clock, () => 42.4);

    expect(service.liveness()).toEqual({
      status: 'ok',
      service: 'level-zero-api',
      uptimeSeconds: 42,
      timestamp: '2026-02-01T12:00:00.000Z',
    });
  });
});

describe('HealthService.readiness', () => {
  it('reports ok when every dependency is up', async () => {
    const service = new HealthService([probe('postgres', up), probe('redis', up)], clock);

    const report = await service.readiness();

    expect(report.status).toBe('ok');
    expect(Object.keys(report.checks)).toEqual(['postgres', 'redis']);
  });

  it('reports error when a single dependency is down, keeping the other result', async () => {
    const service = new HealthService([probe('postgres', up), probe('redis', down)], clock);

    const report = await service.readiness();

    expect(report.status).toBe('error');
    expect(report.checks.postgres?.status).toBe('up');
    expect(report.checks.redis).toMatchObject({ status: 'down', error: 'connection refused' });
  });

  it('runs probes concurrently rather than one after another', async () => {
    const slow = (name: string): HealthProbe => ({
      name,
      check: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return up;
      },
    });
    const service = new HealthService([slow('postgres'), slow('redis')], clock);

    const startedAt = Date.now();
    await service.readiness();

    expect(Date.now() - startedAt).toBeLessThan(70);
  });

  it('is ok when there is nothing to probe', async () => {
    expect((await new HealthService([], clock).readiness()).status).toBe('ok');
  });
});
