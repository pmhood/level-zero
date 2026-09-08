import { type EntitySnapshot } from '../entity/entity';
import { type Clock } from '../shared/clock';
import { type IdGenerator } from '../shared/id';
import { requireJsonObject, requireOneOf, requireText } from '../shared/validation';

/**
 * Why a version exists.
 *
 * Versions are *meaningful* revisions, not autosaves: the editor's undo history
 * and frequent saves are a separate concern (issue #14). Every entry here is an
 * event a user would recognise in a history list.
 */
export const VERSION_REASONS = [
  'manual',
  'milestone',
  'restore',
  'branch',
  'promotion',
  'ai_edit',
  'playtest',
  'import',
] as const;

export type VersionReason = (typeof VERSION_REASONS)[number];

export const DEFAULT_BRANCH = 'main';
export const MAX_BRANCH_NAME_LENGTH = 100;

/**
 * An immutable point in an entity's history.
 *
 * Versions form a DAG: `parentVersionId` gives the edge, `branchName` labels the
 * line of work, and `versionNumber` orders them within the entity. Nothing ever
 * updates a version row — restore and promote add new ones.
 */
export interface EntityVersion {
  id: string;
  projectId: string;
  entityId: string;
  /** Monotonic within the entity, starting at 1. */
  versionNumber: number;
  parentVersionId: string | null;
  branchName: string;
  snapshot: EntitySnapshot;
  reason: VersionReason;
  /** Source context: what restored it, which generation produced it, ... */
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: Date;
}

export interface CreateEntityVersionInput {
  projectId: string;
  entityId: string;
  versionNumber: number;
  parentVersionId: string | null;
  branchName?: string;
  snapshot: EntitySnapshot;
  reason: VersionReason;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
}

export interface VersionFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createEntityVersion(
  input: CreateEntityVersionInput,
  deps: VersionFactoryDeps,
): EntityVersion {
  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    entityId: requireText('entityId', input.entityId, 200),
    versionNumber: input.versionNumber,
    parentVersionId: input.parentVersionId,
    branchName: requireText(
      'branchName',
      input.branchName ?? DEFAULT_BRANCH,
      MAX_BRANCH_NAME_LENGTH,
    ),
    snapshot: {
      ...input.snapshot,
      tags: [...input.snapshot.tags],
      data: structuredClone(input.snapshot.data),
    },
    reason: requireOneOf('reason', input.reason, VERSION_REASONS),
    metadata: requireJsonObject('metadata', input.metadata),
    createdBy: input.createdBy ?? null,
    createdAt: deps.clock.now(),
  };
}
