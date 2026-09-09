import type { StatusTone } from '@level-zero/ui';

export interface DependencyCheck {
  status: 'up' | 'down';
  latencyMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface HealthReport {
  status: 'ok' | 'error';
  service: string;
  timestamp: string;
  checks: Record<string, DependencyCheck>;
}

export interface DependencyRow {
  name: string;
  tone: StatusTone;
  label: string;
  detail: string;
}

/** Turns an API health payload into rows the status panel can render directly. */
export function toDependencyRows(report: HealthReport | undefined): DependencyRow[] {
  if (!report) return [];

  return Object.entries(report.checks).map(([name, check]) => ({
    name,
    tone: check.status === 'up' ? 'success' : 'error',
    label: check.status === 'up' ? 'up' : 'down',
    detail: check.status === 'up' ? formatDetail(check) : (check.error ?? 'unavailable'),
  }));
}

function formatDetail(check: DependencyCheck): string {
  const migrations = check.details?.appliedMigrations;
  const latency = `${check.latencyMs}ms`;
  return typeof migrations === 'number' ? `${latency} · ${migrations} migrations` : latency;
}

/** Overall tone for the panel header, including the not-yet-loaded case. */
export function overallTone(report: HealthReport | undefined, isError = false): StatusTone {
  if (isError) return 'error';
  if (!report) return 'neutral';
  return report.status === 'ok' ? 'success' : 'error';
}
