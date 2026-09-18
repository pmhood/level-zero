'use client';

import type { ReviewState } from '@level-zero/domain';
import {
  Button,
  CloseIcon,
  ListIcon,
  PlusIcon,
  StatusBadge,
  cn,
  type JSONContent,
} from '@level-zero/ui';
import { useMemo, useState } from 'react';

import { useEntityFindings } from '@/features/consistency/use-findings';
import { reviewStateBadge } from '@/features/review/review';
import { useAnchoredCommentThreads, useAnchoredReviewStatuses } from '@/features/review/use-review';

import { documentOutline, type OutlineEntry } from './document-outline';
import {
  documentTarget,
  sectionFindings,
  sectionHeading,
  sectionStates,
  unresolvedThreadCounts,
} from './section-review';

/**
 * The table of contents beside the GDD (spec section 35, `docs/mockups/gdd-workspace.png`):
 * numbered sections, an Appendices group lettered separately, an affordance to
 * add a section, and where each section stands and how much of the
 * conversation about it is still open.
 *
 * Stale sits beside the review state rather than among its values: it is
 * computed by the consistency scan from an entity the section references
 * having moved, so a section can be Approved *and* stale (#188).
 *
 * Numbering and the appendix group are presentation, recomputed from reading
 * order on every render (`documentOutline`) — nothing here is stored. A
 * section nobody has decided anything about reads as Draft, because that is
 * what no decision at all means (`resolveReviewState`) — nothing is seeded to
 * make it so. A heading whose id has not been minted yet carries no badge and
 * cannot be jumped to: nothing can be anchored to it yet.
 *
 * Collapses to a toggleable drawer below `lg`, rather than disappearing —
 * `hidden ... lg:block` used to mean "gone" on a narrow viewport.
 */
export function GddOutline({
  projectId,
  documentId,
  content,
  activeSectionId,
  canAddSection,
  onSelect,
  onAddSection,
}: {
  projectId: string;
  documentId: string;
  content: JSONContent | null;
  activeSectionId: string | null;
  /** False for an archived document: read-only, so there is nothing to add. */
  canAddSection: boolean;
  onSelect: (entry: OutlineEntry) => void;
  onAddSection: () => void;
}) {
  const [open, setOpen] = useState(false);
  const outline = useMemo(() => documentOutline(content), [content]);
  const appendices = outline.appendices;
  const target = useMemo(() => documentTarget(documentId), [documentId]);

  const statuses = useAnchoredReviewStatuses(projectId, target);
  const threads = useAnchoredCommentThreads(projectId, target);
  const findings = useEntityFindings(projectId, documentId);

  const states = useMemo(() => sectionStates(statuses.data ?? []), [statuses.data]);
  const openThreads = useMemo(() => unresolvedThreadCounts(threads.data ?? []), [threads.data]);
  const stale = useMemo(
    () => sectionFindings(findings.data ?? [], documentId),
    [findings.data, documentId],
  );

  const stateFor = (id: string | null): ReviewState | null =>
    id === null ? null : (states.get(id) ?? 'draft');
  const threadsFor = (id: string | null): number => (id === null ? 0 : (openThreads.get(id) ?? 0));
  const isStale = (id: string | null): boolean => id !== null && stale.has(id);

  const empty = outline.sections.length === 0 && appendices === null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Show table of contents"
        className="flex w-10 shrink-0 flex-col items-center gap-2 border-r border-border-subtle py-5 text-muted-foreground hover:bg-hover hover:text-foreground lg:hidden"
      >
        <ListIcon className="size-4" />
      </button>

      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-[rgba(6,8,12,.6)] lg:hidden"
        />
      )}

      <nav
        aria-label="Document outline"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[280px] shrink-0 -translate-x-full flex-col overflow-y-auto border-r border-border-subtle bg-surface px-3 py-5 shadow-[var(--lz-shadow-floating)] transition-transform duration-150 ease-out',
          open && 'translate-x-0',
          'lg:static lg:z-auto lg:w-[220px] lg:translate-x-0 lg:shadow-none lg:transition-none',
        )}
      >
        <div className="flex items-center justify-between px-2">
          <p className="text-xs font-medium text-muted-foreground">Table of Contents</p>
          <div className="flex items-center gap-1">
            {canAddSection && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Add section"
                onClick={onAddSection}
                className="size-6"
              >
                <PlusIcon className="size-3.5" />
              </Button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close table of contents"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground lg:hidden"
            >
              <CloseIcon className="size-3.5" />
            </button>
          </div>
        </div>

        {empty ? (
          <p className="mt-2 px-2 text-xs text-faint-foreground">
            Headings you add show up here as the document&rsquo;s outline.
          </p>
        ) : (
          <ol className="mt-2 space-y-0.5">
            {outline.sections.map((entry) => (
              <li key={entry.id ?? entry.number}>
                <OutlineRow
                  entry={entry}
                  active={entry.id !== null && entry.id === activeSectionId}
                  openThreads={threadsFor(entry.id)}
                  state={stateFor(entry.id)}
                  stale={isStale(entry.id)}
                  onSelect={() => onSelect(entry)}
                />
              </li>
            ))}
          </ol>
        )}

        {appendices && (
          <div className="mt-4">
            <OutlineRow
              entry={appendices.heading}
              active={appendices.heading.id !== null && appendices.heading.id === activeSectionId}
              openThreads={threadsFor(appendices.heading.id)}
              state={stateFor(appendices.heading.id)}
              stale={isStale(appendices.heading.id)}
              heading
              onSelect={() => onSelect(appendices.heading)}
            />
            <ol className="mt-0.5 space-y-0.5">
              {appendices.sections.map((entry) => (
                <li key={entry.id ?? entry.number}>
                  <OutlineRow
                    entry={entry}
                    active={entry.id !== null && entry.id === activeSectionId}
                    openThreads={threadsFor(entry.id)}
                    state={stateFor(entry.id)}
                    stale={isStale(entry.id)}
                    onSelect={() => onSelect(entry)}
                  />
                </li>
              ))}
            </ol>
          </div>
        )}

        {canAddSection && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAddSection}
            className="mt-3 w-full justify-start text-muted-foreground"
          >
            <PlusIcon className="size-4" />
            Add Section
          </Button>
        )}
      </nav>
    </>
  );
}

function OutlineRow({
  entry,
  active,
  openThreads,
  state,
  stale,
  heading = false,
  onSelect,
}: {
  entry: OutlineEntry;
  active: boolean;
  openThreads: number;
  /** Null for a heading with no id yet: there is nothing to have a status. */
  state: ReviewState | null;
  /** Beside the review state rather than replacing it: a section can be Approved and stale. */
  stale: boolean;
  /** True for the Appendices heading itself: a group label, not a numbered row. */
  heading?: boolean;
  onSelect: () => void;
}) {
  const badge = state === null ? null : reviewStateBadge(state);
  const label = sectionHeading(entry.text);

  return (
    <button
      type="button"
      onClick={onSelect}
      title={label}
      style={{ paddingLeft: `${(entry.level - 1) * 12 + 8}px` }}
      className={cn('w-full rounded-md py-1 pr-2 text-left hover:bg-hover', active && 'bg-active')}
    >
      <span
        className={cn(
          'flex items-baseline gap-1.5 text-xs',
          heading
            ? 'font-medium text-muted-foreground'
            : active
              ? 'text-foreground'
              : 'text-muted-foreground',
        )}
      >
        {entry.number && (
          <span className="shrink-0 tabular-nums text-faint-foreground">{entry.number}.</span>
        )}
        <span className="truncate">{label}</span>
      </span>
      {badge && (
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
          {stale && <StatusBadge tone="warning">Stale</StatusBadge>}
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
