import type { AnchoredReviewStatus, CommentThread, Finding, ReviewState } from '@level-zero/domain';

import type { AnchoredTargetParams, ReviewTargetParams } from '@/lib/api';

/**
 * How a GDD is reviewed: a document is an `Entity`, and a section of one is
 * that entity with the section's minted id as the anchor
 * (docs/decisions/gdd-section-identity.md §3). There is no GDD-specific review
 * record and no second target type.
 */
export function documentTarget(documentId: string): AnchoredTargetParams {
  return { targetType: 'entity', targetId: documentId };
}

export function sectionTarget(documentId: string, sectionId: string): ReviewTargetParams {
  return { targetType: 'entity', targetId: documentId, anchor: sectionId };
}

/** What an untitled heading is called, matching the outline's own wording. */
export function sectionHeading(text: string): string {
  return text.trim() || 'Untitled section';
}

/**
 * The state each anchored section is in. A section nobody has decided anything
 * about is absent, and its caller reads that as `draft` — which is what makes a
 * document with no decisions read as Draft rather than as blank.
 */
export function sectionStates(statuses: readonly AnchoredReviewStatus[]): Map<string, ReviewState> {
  return new Map(statuses.map((status) => [status.anchor, status.state]));
}

/**
 * The open findings against each section, keyed by its anchor.
 *
 * Stale is deliberately not a fifth `ReviewState` (#188): it is computed from a
 * dependency by the consistency scan rather than decided by a person, so a
 * section is Approved *and* stale and both are shown. The anchor comes off the
 * finding's own evidence — `FindingEvidence.anchor`, the same minted section id
 * a decision is recorded against — so nothing here reads the prose in `where`.
 */
export function sectionFindings(
  findings: readonly Finding[],
  documentId: string,
): Map<string, Finding[]> {
  const byAnchor = new Map<string, Finding[]>();

  for (const finding of findings) {
    const anchors = finding.evidence
      .filter((evidence) => evidence.entityId === documentId)
      .map((evidence) => evidence.anchor)
      .filter((anchor): anchor is string => anchor !== undefined);

    for (const anchor of new Set(anchors)) {
      const group = byAnchor.get(anchor);
      if (group) group.push(finding);
      else byAnchor.set(anchor, [finding]);
    }
  }
  return byAnchor;
}

/** How many threads on each section are still open — what the outline marks. */
export function unresolvedThreadCounts(threads: readonly CommentThread[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const thread of threads) {
    const anchor = thread.comment.target.anchor;
    if (anchor === null || thread.comment.resolvedAt !== null) continue;
    counts.set(anchor, (counts.get(anchor) ?? 0) + 1);
  }
  return counts;
}

/**
 * The anchors that no longer name a section of the document, oldest thread
 * first and then any anchor only a decision mentions.
 *
 * Orphaning is computed here and never stored: nothing is deleted, edited or
 * re-pointed when a writer removes a heading, so restoring a version that still
 * has it brings its comments and its status back on its own (§5.3).
 */
export function orphanedAnchors(
  threads: readonly CommentThread[],
  statuses: readonly AnchoredReviewStatus[],
  liveSectionIds: ReadonlySet<string>,
): string[] {
  const anchors = [
    ...threads.map((thread) => thread.comment.target.anchor),
    ...statuses.map((status) => status.anchor),
  ];

  return [...new Set(anchors.filter((anchor): anchor is string => anchor !== null))].filter(
    (anchor) => !liveSectionIds.has(anchor),
  );
}
