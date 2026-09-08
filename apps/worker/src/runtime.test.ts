import { type DependencyCheckResult } from '@level-zero/database';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWorkerRuntime, type WorkerProbe, type WorkerRuntime } from './runtime';

const up: DependencyCheckResult = { status: 'up', latencyMs: 1 };
const down: DependencyCheckResult = { status: 'down', latencyMs: 1, error: 'ECONNREFUSED' };

const silentLogger = { log: () => {}, error: () => {} };

function probe(name: string, result: DependencyCheckResult): WorkerProbe {
  return { name, check: async () => result };
}

let runtime: WorkerRuntime | undefined;

afterEach(async () => {
  await runtime?.stop();
  runtime = undefined;
});

describe('createWorkerRuntime', () => {
  it('serves 200 on /health when dependencies are up', async () => {
    runtime = createWorkerRuntime({
      port: 0,
      probes: [probe('postgres', up), probe('redis', up)],
      logger: silentLogger,
    });
    const port = await runtime.start();

    const response = await fetch(`http://127.0.0.1:${port}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: 'level-zero-worker',
      status: 'ok',
    });
  });

  it('serves 503 when a dependency is down', async () => {
    runtime = createWorkerRuntime({
      port: 0,
      probes: [probe('postgres', up), probe('redis', down)],
      logger: silentLogger,
    });
    const port = await runtime.start();

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const body = (await response.json()) as { checks: Record<string, DependencyCheckResult> };

    expect(response.status).toBe(503);
    expect(body.checks.redis?.error).toBe('ECONNREFUSED');
  });

  it('returns 404 for unknown paths', async () => {
    runtime = createWorkerRuntime({ port: 0, probes: [], logger: silentLogger });
    const port = await runtime.start();

    expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(404);
  });

  it('releases dependencies exactly once on stop', async () => {
    const onShutdown = vi.fn(async () => {});
    const instance = createWorkerRuntime({
      port: 0,
      probes: [],
      onShutdown,
      logger: silentLogger,
    });
    const port = await instance.start();
    await instance.stop();

    expect(onShutdown).toHaveBeenCalledTimes(1);
    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
  });
});
