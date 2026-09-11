import {
  ACTIVE_JOB_STATUSES,
  CONSISTENCY_SCAN_JOB_STEPS,
  type EntityType,
  type FindingSeverity,
  type Job,
} from '@level-zero/domain';
import type { StatusTone } from '@level-zero/ui';

/**
 * Where each canonical entity type actually lives today, so a finding can
 * deep-link to the real thing rather than duplicating its data (the issue's
 * "use the canonical route" constraint).
 *
 * Deliberately partial: `prototype`, `build`, `scene` and `asset_reference`
 * have no workspace page in this app yet, and evidence for one of those
 * renders without a link rather than a dead one.
 */
const ENTITY_TYPE_ROUTE_SEGMENTS: Partial<Record<EntityType, string>> = {
  idea: 'idea-lab',
  design_pillar: 'idea-lab',
  character: 'characters',
  location: 'world',
  faction: 'world',
  region: 'world',
  lore: 'world',
  event: 'world',
  hazard: 'world',
  culture: 'world',
  technology: 'world',
  mechanic: 'mechanics',
  system: 'mechanics',
  moodboard: 'moodboards',
  document: 'gdd',
};

/** The canonical workspace URL for an entity type, or `null` if it has none yet. */
export function canonicalEntityHref(projectId: string, entityType: EntityType): string | null {
  const segment = ENTITY_TYPE_ROUTE_SEGMENTS[entityType];
  return segment ? `/projects/${projectId}/${segment}` : null;
}

/** Maps a finding's severity onto the three non-success `StatusTone`s (spec section 19). */
export function severityTone(severity: FindingSeverity): StatusTone {
  switch (severity) {
    case 'conflict':
      return 'error';
    case 'warning':
      return 'warning';
    default:
      return 'neutral';
  }
}

const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  info: 'Info',
  warning: 'Warning',
  conflict: 'Conflict',
};

export function severityLabel(severity: FindingSeverity): string {
  return SEVERITY_LABELS[severity];
}

/** Explicit progress for a consistency-scan job — the same shape generation progress uses. */
export interface ScanProgress {
  step: string;
  completed: number;
  total: number;
}

/**
 * How far the latest scan has got. Before a worker has picked the job up
 * there is no step yet, and "Queued" is the honest thing to say (spec
 * section 42: explicit progress rather than an endless spinner).
 */
export function scanProgress(job: Job | null): ScanProgress {
  return {
    step: job?.progress.step ?? 'Queued',
    completed: job?.progress.completed ?? 0,
    total: job?.progress.total ?? CONSISTENCY_SCAN_JOB_STEPS.length,
  };
}

export function scanProgressLabel(progress: ScanProgress): string {
  return `${progress.step} — ${progress.completed} of ${progress.total} complete`;
}

const ACTIVE_STATUSES = new Set<string>(ACTIVE_JOB_STATUSES);

export function isScanActive(job: Job | null): boolean {
  return Boolean(job && ACTIVE_STATUSES.has(job.status));
}

/** A check's id, humanized — `duplicate-name` reads as `Duplicate name`. */
export function checkTitle(checkId: string): string {
  const words = checkId.split('-').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A plain, unambiguous timestamp — the scan surface reads as a report, not a live feed. */
export function formatTimestamp(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
