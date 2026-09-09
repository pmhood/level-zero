import { type Clock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { optionalText, requireOneOf, requireText } from '../shared/validation';

/**
 * How far along a prototype version is.
 *
 * `draft` is a set of pinned versions still being assembled, `playable` one
 * someone can actually run — usually because a build artifact is attached —
 * and `archived` one that is no longer worth playing.
 */
export const PROTOTYPE_VERSION_STATUSES = ['draft', 'playable', 'archived'] as const;
export type PrototypeVersionStatus = (typeof PROTOTYPE_VERSION_STATUSES)[number];

export const MAX_PROTOTYPE_VERSION_NAME_LENGTH = 200;
export const MAX_PROTOTYPE_VERSION_NOTES_LENGTH = 10_000;
export const MAX_PROTOTYPE_VERSION_CREATED_BY_LENGTH = 200;

/**
 * One entity, pinned to the exact version of it this prototype was built from.
 *
 * The version id is the point: an entity id alone would silently follow the
 * entity as it changes, which is precisely what a playable experiment must not
 * do.
 */
export interface PrototypeMember {
  entityId: string;
  entityVersionId: string;
}

/**
 * A playable experiment, recorded as the exact creative versions it represents.
 *
 * The prototype itself is an ordinary `Entity` of type `prototype` — identity,
 * name, tags and status live there, like every other game object. This row is
 * the part an entity cannot express: an immutable set of `EntityVersion`
 * references, so "what was in v1" keeps answering the same thing after the
 * characters, mechanics and scenes it named have moved on.
 *
 * `members` is fixed at capture. `status`, `notes` and `buildAssetId` are
 * annotations that can be updated afterwards — a build is produced *after* the
 * versions going into it are chosen.
 */
export interface PrototypeVersion {
  id: string;
  projectId: string;
  /** The `prototype` entity this version belongs to. */
  prototypeId: string;
  /** Monotonic within the prototype, starting at 1. */
  versionNumber: number;
  /** Optional label, e.g. "vertical slice". The number is the identity. */
  name: string | null;
  status: PrototypeVersionStatus;
  notes: string | null;
  /** Optional playable build: an `Asset`, usually of kind `build_artifact`. */
  buildAssetId: string | null;
  /** The exact entity versions this prototype version is made of. */
  members: PrototypeMember[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePrototypeVersionInput {
  projectId: string;
  prototypeId: string;
  versionNumber: number;
  name?: string | null;
  status?: PrototypeVersionStatus;
  notes?: string | null;
  buildAssetId?: string | null;
  members: readonly PrototypeMember[];
  createdBy?: string | null;
}

export interface PrototypeVersionFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createPrototypeVersion(
  input: CreatePrototypeVersionInput,
  deps: PrototypeVersionFactoryDeps,
): PrototypeVersion {
  const now = deps.clock.now();

  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    prototypeId: requireText('prototypeId', input.prototypeId, 200),
    versionNumber: input.versionNumber,
    name: optionalText('name', input.name, MAX_PROTOTYPE_VERSION_NAME_LENGTH),
    status: requireOneOf('status', input.status ?? 'draft', PROTOTYPE_VERSION_STATUSES),
    notes: optionalText('notes', input.notes, MAX_PROTOTYPE_VERSION_NOTES_LENGTH),
    buildAssetId: optionalText('buildAssetId', input.buildAssetId, 200),
    members: normalizeMembers(input.members),
    createdBy: optionalText('createdBy', input.createdBy, MAX_PROTOTYPE_VERSION_CREATED_BY_LENGTH),
    createdAt: now,
    updatedAt: now,
  };
}

export interface AnnotatePrototypeVersionInput {
  status?: PrototypeVersionStatus;
  notes?: string | null;
  buildAssetId?: string | null;
}

/**
 * Returns a new version with its annotations updated; the input is never
 * mutated.
 *
 * Only `status`, `notes` and `buildAssetId` can change. The pinned members are
 * the historical record and are never rewritten — a different set of versions
 * is a new prototype version.
 */
export function annotatePrototypeVersion(
  version: PrototypeVersion,
  patch: AnnotatePrototypeVersionInput,
  deps: { clock: Clock },
): PrototypeVersion {
  const next: PrototypeVersion = { ...version, members: [...version.members] };

  if (patch.status !== undefined) {
    next.status = requireOneOf('status', patch.status, PROTOTYPE_VERSION_STATUSES);
  }
  if (patch.notes !== undefined) {
    next.notes = optionalText('notes', patch.notes, MAX_PROTOTYPE_VERSION_NOTES_LENGTH);
  }
  if (patch.buildAssetId !== undefined) {
    next.buildAssetId = optionalText('buildAssetId', patch.buildAssetId, 200);
  }

  next.updatedAt = deps.clock.now();
  return next;
}

/**
 * Validates the pinned members, keeping the order they were given in.
 *
 * An entity named twice is rejected rather than de-duplicated: two versions of
 * the same character in one prototype is a mistake with no sensible winner.
 */
function normalizeMembers(members: readonly PrototypeMember[]): PrototypeMember[] {
  const seen = new Set<string>();

  return members.map((member) => {
    const entityId = requireText('members[].entityId', member.entityId, 200);
    if (seen.has(entityId)) {
      throw new ValidationError('An entity can only be included once in a prototype version', {
        field: 'members',
        entityId,
      });
    }
    seen.add(entityId);

    return {
      entityId,
      entityVersionId: requireText('members[].entityVersionId', member.entityVersionId, 200),
    };
  });
}
