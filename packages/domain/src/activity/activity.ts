import { type Clock } from '../shared/clock';
import { type IdGenerator } from '../shared/id';
import { optionalText, requireJsonObject, requireOneOf, requireText } from '../shared/validation';

/**
 * The meaningful things worth telling a project's story.
 *
 * An activity type is added when a domain service reaches a state a person
 * would recognise later, never for a read, a poll, or an autosave tick — the
 * same line `VERSION_REASONS` draws for one entity's history, drawn here for
 * the project-wide feed. Two classes the issue names are deliberately absent:
 * "meaningful mechanic parameter changes" needs the reusable parameter model
 * from issue #45, which does not exist yet, and "asset approved" needs an
 * approval concept neither `Asset` nor `Entity` has. Agent/build events are
 * explicitly future work. All are additions for whoever builds them, not
 * types to guess the shape of now.
 */
export const ACTIVITY_TYPES = [
  'entity_created',
  'entity_archived',
  'entity_restored',
  'entity_promoted',
  'entity_version_created',
  'entity_version_restored',
  'generation_completed',
  'generation_failed',
  'prototype_version_created',
  'playtest_completed',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** What kind of thing `subjectId` names, so a reader knows what to fetch or where to link. */
export const ACTIVITY_SUBJECT_TYPES = [
  'entity',
  'entity_version',
  'generation',
  'prototype_version',
  'playtest',
] as const;
export type ActivitySubjectType = (typeof ACTIVITY_SUBJECT_TYPES)[number];

export const MAX_ACTIVITY_SUMMARY_LENGTH = 300;
export const MAX_ACTIVITY_ACTOR_LENGTH = 200;

/**
 * One meaningful, project-scoped event, worded once and kept forever.
 *
 * `summary` is composed at the moment the event happens from whatever the
 * calling service has in hand, then stored verbatim and never regenerated.
 * That is what lets the feed keep reading sensibly after its subject is
 * renamed, archived, or gone outright — the alternative, re-deriving the
 * sentence from the subject on every read, is exactly what breaks when the
 * subject no longer resolves. `metadata` stays small and structured, for a
 * richer view that wants a reason or an output count; it is never a copy of
 * the subject's own content, which is what versions and snapshots are for.
 * `subjectId` deliberately carries no foreign key — `subjectType` says which
 * table it would point at, and a row here must outlive whatever it names.
 */
export interface Activity {
  id: string;
  projectId: string;
  type: ActivityType;
  /** Precomputed sentence: durable even if the subject is renamed, archived, or gone. */
  summary: string;
  subjectType: ActivitySubjectType;
  subjectId: string;
  /** Compact, event-specific context — never a full entity/version snapshot. */
  metadata: Record<string, unknown>;
  /** Free text until authentication lands; then a user id. Null when unknown. */
  actor: string | null;
  createdAt: Date;
}

export interface RecordActivityInput {
  projectId: string;
  type: ActivityType;
  summary: string;
  subjectType: ActivitySubjectType;
  subjectId: string;
  metadata?: Record<string, unknown>;
  actor?: string | null;
}

export interface ActivityFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createActivity(input: RecordActivityInput, deps: ActivityFactoryDeps): Activity {
  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    type: requireOneOf('type', input.type, ACTIVITY_TYPES),
    summary: requireText('summary', input.summary, MAX_ACTIVITY_SUMMARY_LENGTH),
    subjectType: requireOneOf('subjectType', input.subjectType, ACTIVITY_SUBJECT_TYPES),
    subjectId: requireText('subjectId', input.subjectId, 200),
    metadata: requireJsonObject('metadata', input.metadata),
    actor: optionalText('actor', input.actor, MAX_ACTIVITY_ACTOR_LENGTH),
    createdAt: deps.clock.now(),
  };
}

/**
 * Shortens free text so it fits in a one-line summary, without ever throwing.
 *
 * Used where a summary embeds something unbounded, like a generation failure
 * message — the activity is still worth recording even when the diagnostic
 * behind it is long, so this trims rather than rejecting.
 */
export function truncateForSummary(
  text: string,
  maxLength: number = MAX_ACTIVITY_SUMMARY_LENGTH,
): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
