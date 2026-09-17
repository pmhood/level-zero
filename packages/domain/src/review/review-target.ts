import { ValidationError } from '../shared/errors';
import { optionalText, requireOneOf, requireText } from '../shared/validation';

/**
 * The kinds of thing the review layer can be pointed at.
 *
 * `entity` covers all 19 `ENTITY_TYPES`, documents included: a GDD is a
 * `document` entity, so a comment or a decision about one of its sections is
 * this target with an `anchor` rather than a fourth target type. Assets and
 * prototype versions are named separately because neither is an entity
 * (`asset.ts`, `prototype-version.ts`, docs/decisions/playtest-record-model.md
 * §2.2) and neither can be reached through the entity graph as itself.
 */
export const REVIEW_TARGET_TYPES = ['entity', 'asset', 'prototype_version'] as const;
export type ReviewTargetType = (typeof REVIEW_TARGET_TYPES)[number];

export const MAX_REVIEW_TARGET_ANCHOR_LENGTH = 200;

/**
 * What a comment or a review decision is about.
 *
 * `id` is the target's own id and never its name, so renaming the thing under
 * discussion cannot move or break a comment. Nothing about the target is
 * copied in: the label a reader sees is resolved on every read by
 * `ReviewTargetResolver`, the same reasoning that keeps `Activity.subjectId`
 * free of a foreign key — a row here has to outlive whatever it names.
 */
export interface ReviewTarget {
  type: ReviewTargetType;
  id: string;
  /**
   * A stable address inside the target. Null means the whole target, and it is
   * stored and matched, never parsed.
   *
   * For a `document` entity it is the bare `sectionId` a top-level heading
   * carries — no prefix, no path, no heading text — so renaming, moving or
   * demoting a section leaves what is anchored to it untouched, and deleting
   * one orphans rather than erases it (docs/decisions/gdd-section-identity.md
   * §3, and `documentSections`). On any other target an anchor remains the
   * caller's to decide; nothing uses one yet.
   */
  anchor: string | null;
  /**
   * The immutable `EntityVersion` this is pinned to. Null means the target as
   * it stands. Only an `entity` target has versions.
   */
  versionId: string | null;
}

export interface ReviewTargetInput {
  type: ReviewTargetType;
  id: string;
  anchor?: string | null;
  versionId?: string | null;
}

/** Names one exact target, for reading its comments or its decision history. */
export interface ReviewTargetFilter {
  targetType: ReviewTargetType;
  targetId: string;
  /** Exact match: `null` selects the whole target, not its anchored sections. */
  anchor: string | null;
}

/**
 * What a target is, as far as the review layer can still see it.
 *
 * Resolved on every read rather than snapshotted, which is what makes a rename
 * invisible to the comments about it. An archived target resolves like any
 * other and reports `archived`, because archiving hides a row from listings and
 * never removes it (README, "Archive, never delete") — so a thread about one
 * still reads correctly.
 */
export interface ResolvedReviewTarget {
  target: ReviewTarget;
  /** The target's name as it reads now: an entity name, a filename, `v3`. */
  label: string;
  archived: boolean;
  /**
   * The version in force, which a judgement is pinned to. Null when the target
   * has no versions — an asset, or an entity nobody has committed yet.
   */
  currentVersionId: string | null;
}

/**
 * Validates a target, rejecting a version pin on something that has no
 * versions rather than letting it read as pinned and then never match.
 */
export function requireReviewTarget(field: string, input: ReviewTargetInput): ReviewTarget {
  const type = requireOneOf(`${field}.type`, input?.type, REVIEW_TARGET_TYPES);
  const versionId = optionalText(`${field}.versionId`, input.versionId, 200);

  if (versionId !== null && type !== 'entity') {
    throw new ValidationError(`${field}.versionId is only meaningful for an entity target`, {
      field: `${field}.versionId`,
      targetType: type,
    });
  }

  return {
    type,
    id: requireText(`${field}.id`, input.id, 200),
    anchor: optionalText(`${field}.anchor`, input.anchor, MAX_REVIEW_TARGET_ANCHOR_LENGTH),
    versionId,
  };
}

/**
 * The filter naming the target a comment or a decision was written about.
 *
 * `versionId` is deliberately dropped: a comment left on v1 still belongs to
 * the target's one thread list, and a judgement pinned to v1 is still part of
 * the target's history.
 */
export function reviewTargetFilter(target: ReviewTarget): ReviewTargetFilter {
  return { targetType: target.type, targetId: target.id, anchor: target.anchor };
}
