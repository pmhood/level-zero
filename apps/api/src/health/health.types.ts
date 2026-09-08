import { type DependencyCheckResult } from '@level-zero/database';

/** One named external dependency the API needs in order to serve traffic. */
export interface HealthProbe {
  readonly name: string;
  check(): Promise<DependencyCheckResult>;
}

export interface LivenessReport {
  status: 'ok';
  service: string;
  uptimeSeconds: number;
  timestamp: string;
}

export interface ReadinessReport {
  status: 'ok' | 'error';
  service: string;
  timestamp: string;
  checks: Record<string, DependencyCheckResult>;
}
