'use client';

import type { ReviewState } from '@level-zero/domain';
import { StatusBadge, type JSONContent } from '@level-zero/ui';
import { useMemo } from 'react';

import { reviewStateBadge } from '@/features/review/review';
import { useAnchoredCommentThreads, useAnchoredReviewStatuses } from '@/features/review/use-review';

import { documentOutline, type DocumentHeading } from './document-outline';
import {
  documentTarget,
  sectionHeading,
  sectionStates,
  unresolvedThreadCounts,
} from './section-review';

/**
 * The table of contents beside the GDD (spec section 35), with where each
 * section stands and how much of the conversation about it is still open.
 *
 * A section nobody has decided anything about reads as Draft, because that is
 * what no decision at all means (`resolveReviewState`) — nothing is seeded to
 * make it so. A heading whose id has not been minted yet carries no badge:
 * nothing can be anchored to it, so claiming a status for it would be a lie.
 */
export function GddOutline({
  projectId,
  documentId,
  content,
  activeSectionId,
  onSelect,
}: {
  projectId: string;
  documentId: string;
  content: JSONContent | null;
  activeSectionId: string | null;
  onSelect: (heading: DocumentHeading, index: number) => void;
}) {
  const headings = useMemo(() => documentOutline(content), [content]);
  const target = useMemo(() => documentTarget(documentId), [documentId]);

  const statuses = useAnchoredReviewStatuses(projectId, target);
  const threads = useAnchoredCommentThreads(projectId, target);

  const states = useMemo(() => sectionStates(statuses.data ?? []), [statuses.data]);
  const openThreads = useMemo(() => unresolvedThreadCounts(threads.data ?? []), [threads.data]);

  return (
    <nav
      aria-label="Document outline"
      className="hidden w-[220px] shrink-0 overflow-y-auto border-r border-border-subtle px-3 py-5 lg:block"
    >
      <p className="px-2 text-xs font-medium text-muted-foreground">Contents</p>
      {headings.length === 0 ? (
        <p className="mt-2 px-2 text-xs text-faint-foreground">
          Headings you add show up here as the document&rsquo;s outline.
        </p>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {headings.map((heading, index) => (
            <li key={index}>
              <OutlineEntry
                heading={heading}
                active={heading.id !== null && heading.id === activeSectionId}
                openThreads={heading.id === null ? 0 : (openThreads.get(heading.id) ?? 0)}
                state={heading.id === null ? null : (states.get(heading.id) ?? 'draft')}
                onSelect={() => onSelect(heading, index)}
              />
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

function OutlineEntry({
  heading,
  active,
  openThreads,
  state,
  onSelect,
}: {
  heading: DocumentHeading;
  active: boolean;
  openThreads: number;
  /** Null for a heading with no id yet: there is nothing to have a status. */
  state: ReviewState | null;
  onSelect: () => void;
}) {
  const badge = state === null ? null : reviewStateBadge(state);

  return (
    <button
      type="button"
      onClick={onSelect}
      title={sectionHeading(heading.text)}
      style={{ paddingLeft: `${(heading.level - 1) * 12 + 8}px` }}
      className={`w-full rounded-md py-1 pr-2 text-left hover:bg-hover ${
        active ? 'bg-active' : ''
      }`}
    >
      <span
        className={`block truncate text-xs ${active ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {sectionHeading(heading.text)}
      </span>
      {badge && (
        <span className="mt-1 flex items-center gap-1.5">
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
          {openThreads > 0 && (
            <span className="text-[11px] text-faint-foreground">
              {openThreads} open {openThreads === 1 ? 'comment' : 'comments'}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
