import { systemClock, type Clock } from '@level-zero/domain';
import { Inject, Injectable, Optional } from '@nestjs/common';

import { type HealthProbe, type LivenessReport, type ReadinessReport } from './health.types';

export const HEALTH_PROBES = Symbol('HEALTH_PROBES');
export const HEALTH_CLOCK = Symbol('HEALTH_CLOCK');
export const HEALTH_UPTIME = Symbol('HEALTH_UPTIME');

const SERVICE_NAME = 'level-zero-api';

@Injectable()
export class HealthService {
  constructor(
    @Inject(HEALTH_PROBES) private readonly probes: readonly HealthProbe[],
    @Optional() @Inject(HEALTH_CLOCK) private readonly clock: Clock = systemClock,
    @Optional()
    @Inject(HEALTH_UPTIME)
    private readonly uptime: () => number = () => process.uptime(),
  ) {}

  /** Is the process running? Deliberately does not touch dependencies. */
  liveness(): LivenessReport {
    return {
      status: 'ok',
      service: SERVICE_NAME,
      uptimeSeconds: Math.round(this.uptime()),
      timestamp: this.clock.now().toISOString(),
    };
  }

  /**
   * Can the process serve traffic? Every probe runs in parallel and one
   * failure is enough to report `error`.
   */
  async readiness(): Promise<ReadinessReport> {
    const results = await Promise.all(
      this.probes.map(async (probe) => [probe.name, await probe.check()] as const),
    );

    const checks = Object.fromEntries(results);
    const healthy = results.every(([, result]) => result.status === 'up');

    return {
      status: healthy ? 'ok' : 'error',
      service: SERVICE_NAME,
      timestamp: this.clock.now().toISOString(),
      checks,
    };
  }
}
