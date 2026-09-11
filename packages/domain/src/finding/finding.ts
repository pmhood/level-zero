import { type Clock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { optionalText, requireOneOf, requireText } from '../shared/validation';

/** How much a finding matters. Maps onto the three non-success `StatusTone`s. */
export const FINDING_SEVERITIES = ['info', 'warning', 'conflict'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

/**
 * Whether a finding was proven by a pure function or judged by a model.
 *
 * `generationId` on `Finding` is non-null exactly when this is `ai_assisted`.
 * The runner sets this, never the check (docs/decisions/consistency-findings.md §6.4).
 */
export const FINDING_ORIGINS = ['deterministic', 'ai_assisted'] as const;
export type FindingOrigin = (typeof FINDING_ORIGINS)[number];

/**
 * Where a finding is in its lifecycle.
 *
 * `open` and `resolved` are the scan's to set. `dismissed` is the user's, and
 * the one status a scan may never write over (§3.2, §4.4).
 */
export const FINDING_STATUSES = ['open', 'dismissed', 'resolved'] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const MAX_FINDING_CHECK_ID_LENGTH = 100;
export const MAX_FINDING_FINGERPRINT_LENGTH = 200;
export const MAX_FINDING_SUMMARY_LENGTH = 1000;
export const MAX_FINDING_EVIDENCE_ENTITY_ID_LENGTH = 200;
export const MAX_FINDING_EVIDENCE_WHERE_LENGTH = 200;
export const MAX_FINDING_EVIDENCE_STATES_LENGTH = 500;
export const MAX_FINDING_DISMISSED_BY_LENGTH = 200;
export const MAX_FINDING_DISMISSED_REASON_LENGTH = 2000;
/** A contradiction has two sides; a finding with fewer is not one. */
export const MIN_FINDING_EVIDENCE = 2;

/**
 * One place to look, and what it says there.
 *
 * `entityId` is the finest locator the codebase can offer today: there is no
 * stable address for a block inside a document. `where` is prose for the
 * reader — a heading path, a parameter label — and is never parsed.
 */
export interface FindingEvidence {
  entityId: string;
  /** Set when the evidence is a specific pinned version rather than the entity as it stands. */
  entityVersionId?: string;
  where: string;
  /** What that place asserts, already formatted: `120 s`, `v3`, `Oxygen Management`. */
  states: string;
}

/** What a check reports. The runner supplies identity, lifecycle and timestamps. */
export interface CheckFinding {
  fingerprint: string;
  severity: FindingSeverity;
  /** One sentence, shown verbatim. */
  summary: string;
  evidence: FindingEvidence[];
}

/**
 * One contradiction, as the last scan saw it.
 *
 * Derived, like `SearchDocument`, and rebuilt by every scan — with one
 * exception: `status`, `resolvedAt`, `dismissedAt`, `dismissedBy` and
 * `dismissedReason` are the lifecycle, and a scan never overwrites them
 * except to move `open` to `resolved` when the fingerprint stops appearing.
 * See docs/decisions/consistency-findings.md §10.
 */
export interface Finding {
  id: string;
  projectId: string;
  /** The `ConsistencyCheck.id` that produced it. */
  checkId: string;
  /** Stable across runs; unique with `projectId`. See §4. */
  fingerprint: string;
  origin: FindingOrigin;
  /** Non-null exactly when `origin` is `ai_assisted`. */
  generationId: string | null;
  severity: FindingSeverity;
  summary: string;
  evidence: FindingEvidence[];
  status: FindingStatus;
  /** When the first scan reported this fingerprint. */
  firstSeenAt: Date;
  /** The scan that most recently reported it — the timestamp the surface shows. */
  lastSeenAt: Date;
  /** Set by the first scan that stopped reporting it. */
  resolvedAt: Date | null;
  dismissedAt: Date | null;
  dismissedBy: string | null;
  /** Optional note the dismissing user left. */
  dismissedReason: string | null;
}

/**
 * What the runner adds to a `CheckFinding` to make it a row: identity and
 * provenance the check has no way to supply for itself (§6.4).
 */
export interface CreateFindingInput extends CheckFinding {
  projectId: string;
  checkId: string;
  origin: FindingOrigin;
  generationId?: string | null;
}

export interface FindingFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Builds the row for a fingerprint as a fresh scan saw it.
 *
 * This is the shape a scan hands to `FindingRepository.upsert` for every
 * `CheckFinding` a check returns. It always starts a finding as `open` — the
 * repository, not this function, is what leaves an existing row's lifecycle
 * alone when the fingerprint was already there (§3.2).
 */
export function createFinding(input: CreateFindingInput, deps: FindingFactoryDeps): Finding {
  const now = deps.clock.now();

  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    checkId: requireText('checkId', input.checkId, MAX_FINDING_CHECK_ID_LENGTH),
    fingerprint: requireText('fingerprint', input.fingerprint, MAX_FINDING_FINGERPRINT_LENGTH),
    origin: requireOneOf('origin', input.origin, FINDING_ORIGINS),
    generationId: input.generationId ?? null,
    severity: requireOneOf('severity', input.severity, FINDING_SEVERITIES),
    summary: requireText('summary', input.summary, MAX_FINDING_SUMMARY_LENGTH),
    evidence: normalizeEvidence(input.evidence),
    status: 'open',
    firstSeenAt: now,
    lastSeenAt: now,
    resolvedAt: null,
    dismissedAt: null,
    dismissedBy: null,
    dismissedReason: null,
  };
}

export interface DismissFindingInput {
  dismissedBy: string;
  reason?: string | null;
}

/**
 * Marks a finding dismissed — the one thing about a row a check may never do
 * (§3.2, §4.4). A later scan that reproduces this fingerprint refreshes the
 * content and leaves this alone.
 */
export function dismissFinding(
  finding: Finding,
  input: DismissFindingInput,
  deps: { clock: Clock },
): Finding {
  return {
    ...finding,
    status: 'dismissed',
    dismissedAt: deps.clock.now(),
    dismissedBy: requireText('dismissedBy', input.dismissedBy, MAX_FINDING_DISMISSED_BY_LENGTH),
    dismissedReason: optionalText(
      'dismissedReason',
      input.reason,
      MAX_FINDING_DISMISSED_REASON_LENGTH,
    ),
  };
}

/**
 * Closes a finding a fresh scan no longer produced.
 *
 * Only an `open` row moves to `resolved` this way and it is idempotent on
 * everything else: a `dismissed` row keeps the user's judgement even after
 * its fingerprint stops appearing, and an already-`resolved` row has nothing
 * left to close. This is what lets a scan runner call it unconditionally on
 * every row it did not reproduce (docs/decisions/consistency-findings.md §3.2, §5).
 */
export function resolveFinding(finding: Finding, deps: { clock: Clock }): Finding {
  if (finding.status !== 'open') return finding;
  return { ...finding, status: 'resolved', resolvedAt: deps.clock.now() };
}

function normalizeEvidence(evidence: readonly FindingEvidence[]): FindingEvidence[] {
  if (evidence.length < MIN_FINDING_EVIDENCE) {
    throw new ValidationError(
      `A finding needs at least ${MIN_FINDING_EVIDENCE} pieces of evidence`,
      { field: 'evidence', actual: evidence.length },
    );
  }

  return evidence.map((item, index) => ({
    entityId: requireText(
      `evidence[${index}].entityId`,
      item.entityId,
      MAX_FINDING_EVIDENCE_ENTITY_ID_LENGTH,
    ),
    entityVersionId:
      item.entityVersionId === undefined
        ? undefined
        : requireText(`evidence[${index}].entityVersionId`, item.entityVersionId, 200),
    where: requireText(`evidence[${index}].where`, item.where, MAX_FINDING_EVIDENCE_WHERE_LENGTH),
    states: requireText(
      `evidence[${index}].states`,
      item.states,
      MAX_FINDING_EVIDENCE_STATES_LENGTH,
    ),
  }));
}
