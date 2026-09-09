import { createServer, type Server } from 'node:http';

import { type DependencyCheckResult } from '@level-zero/database';

export interface WorkerProbe {
  readonly name: string;
  check(): Promise<DependencyCheckResult>;
}

export interface WorkerLogger {
  log(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface WorkerRuntimeOptions {
  /** Port for the health server. Use 0 to let the OS pick one (tests). */
  port: number;
  probes: readonly WorkerProbe[];
  /** Released after the health server stops accepting connections. */
  onShutdown?: () => Promise<void>;
  logger?: WorkerLogger;
}

export interface WorkerRuntime {
  /** Resolves with the port the health server actually bound to. */
  start(): Promise<number>;
  stop(): Promise<void>;
}

/**
 * The worker's process shell: a health server plus an orderly shutdown path.
 *
 * The queue consumer is closed through `onShutdown`, so jobs already in flight
 * finish before the process exits and an unhealthy worker is visible to
 * operators.
 */
export function createWorkerRuntime(options: WorkerRuntimeOptions): WorkerRuntime {
  const logger = options.logger ?? {
    log: (message: string) => console.log(message),
    error: (message: string, error?: unknown) => console.error(message, error ?? ''),
  };

  let server: Server | undefined;

  async function readiness(): Promise<{
    status: 'ok' | 'error';
    checks: Record<string, DependencyCheckResult>;
  }> {
    const results = await Promise.all(
      options.probes.map(async (probe) => [probe.name, await probe.check()] as const),
    );
    return {
      status: results.every(([, result]) => result.status === 'up') ? 'ok' : 'error',
      checks: Object.fromEntries(results),
    };
  }

  return {
    start: () =>
      new Promise<number>((resolve, reject) => {
        server = createServer((request, response) => {
          if (request.url !== '/health' && request.url !== '/health/ready') {
            response.writeHead(404).end();
            return;
          }

          void readiness()
            .then((report) => {
              response
                .writeHead(report.status === 'ok' ? 200 : 503, {
                  'content-type': 'application/json',
                })
                .end(JSON.stringify({ service: 'level-zero-worker', ...report }));
            })
            .catch((error: unknown) => {
              logger.error('[worker] health check failed', error);
              response.writeHead(500).end();
            });
        });

        server.once('error', reject);
        server.listen(options.port, '0.0.0.0', () => {
          const address = server?.address();
          const port = typeof address === 'object' && address ? address.port : options.port;
          logger.log(`[worker] health server listening on http://localhost:${port}/health`);
          resolve(port);
        });
      }),

    stop: async () => {
      if (server) {
        await new Promise<void>((resolve, reject) => {
          server?.close((error) => (error ? reject(error) : resolve()));
        });
        server = undefined;
      }
      await options.onShutdown?.();
      logger.log('[worker] stopped');
    },
  };
}
