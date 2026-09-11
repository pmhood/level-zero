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
 * Deliberately partial: `build`, `scene` and `asset_reference` have no
 * workspace page in this app yet, and evidence for one of those renders
 * without a link rather than a dead one.
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
  prototype: 'prototypes',
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

/**
 * The registered checks' own `title` (docs/decisions/consistency-findings.md
 * §6.2: "shown as the finding's category on the surface"), for the ones this
 * doesn't read correctly off the id alone — `near-duplicate` humanizes to
 * "Near duplicate", not the check's actual "Near-duplicate concept".
 *
 * Kept as a small, literal map rather than importing `CONSISTENCY_CHECKS` /
 * `AI_CONSISTENCY_CHECKS` from `@level-zero/domain`: those registries carry
 * `run` functions built for the worker, and a browser bundle has no reason to
 * pull them in for four title strings.
 */
const CHECK_TITLES: Record<string, string> = {
  'near-duplicate': 'Near-duplicate concept',
};

/** A check's title — the registered one where known, else the id humanized. */
export function checkTitle(checkId: string): string {
  const known = CHECK_TITLES[checkId];
  if (known) return known;

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
