'use client';

import {
  documentSections,
  type AnchoredReviewStatus,
  type DocumentContent,
  type Finding,
} from '@level-zero/domain';
import { Field, Select, StatusBadge, type JSONContent } from '@level-zero/ui';
import { useMemo } from 'react';

import { FindingRow } from '@/features/consistency/finding-row';
import { useEntityFindings } from '@/features/consistency/use-findings';
import { CommentThreads } from '@/features/review/comment-threads';
import { formatDecidedAt, reviewStateBadge } from '@/features/review/review';
import { ReviewSection } from '@/features/review/review-section';
import { useAnchoredCommentThreads, useAnchoredReviewStatuses } from '@/features/review/use-review';

import {
  documentTarget,
  orphanedAnchors,
  sectionFindings,
  sectionHeading,
  sectionTarget,
} from './section-review';

/**
 * Review and discussion for a design document: the document as a whole, and
 * each of its sections (issue #187).
 *
 * Everything here is #70's review infrastructure pointed at an anchor —
 * `ReviewSection` carries the status, the state changes and the threads, and a
 * section is the document entity with its heading's minted id as the anchor.
 * There is no GDD-specific review record, no second vocabulary of states, and
 * nothing that edits a stored target — staleness included, which arrives as an
 * ordinary consistency finding addressed to the section (#188).
 *
 * An archived document is read-only for its prose and not for its review: a
 * decision and a thread are about the writing rather than changes to it, they
 * still read once it is restored, and `ReviewPanel` already says so.
 */
export function GddReview({
  projectId,
  documentId,
  documentName,
  content,
  activeSectionId,
  onSelectSection,
}: {
  projectId: string;
  documentId: string;
  documentName: string;
  /** The body as it stands in the editor: what says which sections are live. */
  content: JSONContent | null;
  /** The section the writer is in, or null for the document as a whole. */
  activeSectionId: string | null;
  onSelectSection: (sectionId: string | null) => void;
}) {
  const sections = useMemo(
    () => (content ? documentSections(content as DocumentContent) : []),
    [content],
  );
  const target = useMemo(() => documentTarget(documentId), [documentId]);

  const statuses = useAnchoredReviewStatuses(projectId, target);
  const threads = useAnchoredCommentThreads(projectId, target);
  const findings = useEntityFindings(projectId, documentId);

  const live = useMemo(() => new Set(sections.map((section) => section.id)), [sections]);
  // A section the writer has just deleted stops being reviewable the moment it
  // leaves the document, so the panel falls back to the document itself rather
  // than offering actions against an anchor nothing matches.
  const selected = activeSectionId !== null && live.has(activeSectionId) ? activeSectionId : null;
  const selectedTitle = sections.find((section) => section.id === selected)?.text ?? '';

  const orphans = orphanedAnchors(threads.data ?? [], statuses.data ?? [], live);
  const stale =
    selected === null ? [] : (sectionFindings(findings.data ?? [], documentId).get(selected) ?? []);

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Reviewing"
        htmlFor="gdd-review-scope"
        hint="Sections follow the caret as you write. A document is approved as a whole as well as section by section."
      >
        <Select
          id="gdd-review-scope"
          value={selected ?? ''}
          onChange={(event) => onSelectSection(event.target.value || null)}
        >
          <option value="">The whole document</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {sectionHeading(section.text)}
            </option>
          ))}
        </Select>
      </Field>

      <ReviewSection
        projectId={projectId}
        target={selected === null ? target : sectionTarget(documentId, selected)}
        title={selected === null ? documentName : sectionHeading(selectedTitle)}
        description={
          selected === null
            ? 'Where the document stands as a whole, and what people have said about it.'
            : 'Where this section stands, and what people have said about it.'
        }
      />

      {stale.length > 0 && <StaleSection projectId={projectId} findings={stale} />}

      {orphans.length > 0 && (
        <RemovedSections
          projectId={projectId}
          documentId={documentId}
          anchors={orphans}
          statuses={statuses.data ?? []}
        />
      )}
    </div>
  );
}

/**
 * The design that moved underneath this section since it was last reviewed.
 *
 * Stale is not a fifth review state (#188): it sits beside the status above
 * rather than replacing it, because a section can be Approved *and* out of
 * date, and that pair is the message. Clearing it is a human act — approving
 * the section again above, or dismissing the finding, which is why these are
 * the Consistency surface's own rows rather than a GDD-shaped copy of them:
 * naming what moved, the way through to it and Dismiss all come with
 * `FindingRow`, and a dismissal made here is the same dismissal made there.
 *
 * What is shown is the last scan's answer, not a live recompute: re-approving
 * clears the finding when the scan next runs (`docs/decisions/consistency-findings.md` §5).
 */
function StaleSection({
  projectId,
  findings,
}: {
  projectId: string;
  findings: readonly Finding[];
}) {
  return (
    <section aria-label="Out of date" className="flex flex-col gap-2">
      <div>
        <h3 className="text-[15px] font-semibold text-foreground">Out of date</h3>
        <p className="mt-0.5 text-xs text-faint-foreground">
          Entities this section references have changed since it was last reviewed. Approving it
          again clears this, and so does dismissing the finding.
        </p>
      </div>

      <ul className="divide-y divide-border-subtle rounded-md border border-border-subtle bg-raised">
        {findings.map((finding) => (
          <FindingRow key={finding.id} projectId={projectId} finding={finding} />
        ))}
      </ul>
    </section>
  );
}

/**
 * What was written about sections the document no longer has.
 *
 * Nothing was deleted or re-pointed when the heading went, so these read as
 * ordinary threads — replies, resolve and reopen all work — and come back to
 * their section on their own if a version that still has it is restored. They
 * do not name the section, because nothing ever stored its name: the first
 * comment is what says what it was about.
 */
function RemovedSections({
  projectId,
  documentId,
  anchors,
  statuses,
}: {
  projectId: string;
  documentId: string;
  anchors: readonly string[];
  statuses: readonly AnchoredReviewStatus[];
}) {
  const byAnchor = new Map(statuses.map((status) => [status.anchor, status]));

  return (
    <section aria-label="Removed sections" className="flex flex-col gap-3">
      <div>
        <h3 className="text-[15px] font-semibold text-foreground">Removed sections</h3>
        <p className="mt-0.5 text-xs text-faint-foreground">
          The sections these were written about are no longer in the document. They count towards
          nothing, and restoring a version that still has the section brings them back.
        </p>
      </div>

      <ul className="flex flex-col gap-4">
        {anchors.map((anchor) => (
          <li
            key={anchor}
            className="flex flex-col gap-2 rounded-md border border-border-subtle bg-raised px-3 py-2.5"
          >
            <OrphanedDecision status={byAnchor.get(anchor) ?? null} />
            <CommentThreads
              projectId={projectId}
              target={sectionTarget(documentId, anchor)}
              canComment={false}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The last thing anybody decided about a section that has since gone. */
function OrphanedDecision({ status }: { status: AnchoredReviewStatus | null }) {
  if (!status?.decision) return null;
  const badge = reviewStateBadge(status.state);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      <span className="text-xs text-faint-foreground">
        {status.decision.actor} · {formatDecidedAt(status.decision.decidedAt)} · for a section no
        longer in the document
      </span>
    </div>
  );
}
