import { documentContent } from '../document/document';
import {
  type DocumentSection,
  documentSectionReferences,
  documentSections,
} from '../document/document-section';
import { type Entity } from '../entity/entity';
import { type ReviewDecision, type ReviewState } from '../review/review-decision';
import { fingerprint, type ConsistencyCheck } from './consistency-check';
import { type CheckFinding } from './finding';

/**
 * The states a section can go stale out of.
 *
 * A draft nobody has signed off on is not out of date, it is a draft; and a
 * rejected section is already known to need work, so saying so again is noise.
 * Stale is deliberately *not* a fifth `ReviewState` (#70, #188): it is computed
 * from a dependency rather than decided by a person, so a section is Approved
 * *and* stale, and that pair is the message.
 */
const REVIEWED_STATES: readonly ReviewState[] = ['review', 'approved'];

/**
 * How much of a heading a finding quotes. `where` is capped at 200 characters
 * and a heading is prose somebody typed, so it is shortened rather than
 * rejected.
 */
const MAX_QUOTED_HEADING_LENGTH = 120;

/** What an untitled heading is called, matching the outline's own wording. */
const UNTITLED_SECTION = 'Untitled section';

/**
 * A GDD section whose referenced entity has changed since the section was last
 * reviewed or approved.
 *
 * This is the other half of the bargain a GDD makes by referencing entities
 * instead of restating them (`docs/design/page-by-page-ux-spec.md` §GDD): the
 * prose is free to describe Kael without copying him, and in exchange the
 * document has to notice when Kael moves. Same shape as
 * `stale-prototype-pin-check`, one level finer — there, a pin names a version
 * the world has left behind; here, a decision names a moment it has.
 *
 * "Changed" is `Entity.updatedAt` after `ReviewDecision.decidedAt`, which is
 * every edit, archive and restore rather than only a committed version: an
 * approval is about the entity the reviewer read, and an uncommitted edit
 * changed it just as much.
 */
export const staleSectionReferenceCheck: ConsistencyCheck = {
  id: 'stale-section-reference',
  title: 'Stale section reference',

  run({ entities, sectionDecisions }) {
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    const decisions = newestByAnchor(sectionDecisions);
    const findings: CheckFinding[] = [];

    for (const document of entities) {
      if (document.type !== 'document' || document.status === 'archived') continue;

      const content = documentContent(document);
      const references = documentSectionReferences(content);

      for (const section of documentSections(content)) {
        const decision = decisions.get(anchorKey(document.id, section.id));
        if (!decision || !REVIEWED_STATES.includes(decision.state)) continue;

        for (const entityId of references.get(section.id) ?? []) {
          // A document cannot make its own sections stale: saving it is the
          // writing being reviewed, not a dependency moving underneath it.
          const referenced = entityId === document.id ? undefined : byId.get(entityId);
          if (!referenced || referenced.updatedAt <= decision.decidedAt) continue;

          findings.push(buildFinding(document, section, decision, referenced));
        }
      }
    }
    return findings;
  },
};

function buildFinding(
  document: Entity,
  section: DocumentSection,
  decision: ReviewDecision,
  referenced: Entity,
): CheckFinding {
  const heading = quotedHeading(section.text);
  const decided = decision.state === 'approved' ? 'approved' : 'sent for review';

  return {
    // The section's minted id is an identity rather than a position, which is
    // what makes it admissible here where a heading's text or ordinal is not
    // (docs/decisions/consistency-findings.md §4.2, as amended by #185). No
    // timestamp and no version id: dismissing this says the check over these
    // objects is not a problem, and must survive the entity changing again.
    fingerprint: fingerprint('stale-section-reference', document.id, section.id, referenced.id),
    severity: 'warning',
    summary: `${referenced.name} has changed since “${heading}” was ${decided}.`,
    evidence: [
      {
        entityId: document.id,
        anchor: section.id,
        where: heading,
        states: `${decided} before ${referenced.name} changed`,
      },
      {
        entityId: referenced.id,
        entityVersionId: referenced.currentVersionId ?? undefined,
        where: referenced.name,
        states: 'has changed since that decision',
      },
    ],
  };
}

/**
 * The decision in force for each anchored section: the newest one, because
 * nothing an older decision said outranks it (`resolveReviewState`).
 *
 * Read by comparing `decidedAt` rather than trusting an order, so the answer
 * does not depend on how the facts were assembled. There is no pinned-version
 * case to handle: an anchored judgement is never pinned (`pinJudgement`), so
 * the newest decision is always the one that applies.
 */
function newestByAnchor(decisions: readonly ReviewDecision[]): Map<string, ReviewDecision> {
  const newest = new Map<string, ReviewDecision>();

  for (const decision of decisions) {
    const { type, id, anchor } = decision.target;
    if (type !== 'entity' || anchor === null) continue;

    const key = anchorKey(id, anchor);
    const held = newest.get(key);
    if (!held || decision.decidedAt > held.decidedAt) newest.set(key, decision);
  }
  return newest;
}

function anchorKey(documentId: string, sectionId: string): string {
  return `${documentId}::${sectionId}`;
}

function quotedHeading(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return UNTITLED_SECTION;

  return trimmed.length > MAX_QUOTED_HEADING_LENGTH
    ? `${trimmed.slice(0, MAX_QUOTED_HEADING_LENGTH - 1)}…`
    : trimmed;
}
