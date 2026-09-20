'use client';

import type { DocumentVersion, Entity, Project } from '@level-zero/domain';
import {
  Button,
  ChevronRightIcon,
  CommentIcon,
  HistoryIcon,
  SearchIcon,
  SparklesIcon,
  StatusBadge,
  Tag,
  WorkspaceHeader,
} from '@level-zero/ui';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { DocumentSwitcher } from './document-switcher';
import { ExportMenu } from './export-menu';
import type { DocumentExportFormat } from './gdd-export';

/**
 * The GDD's document header (issue #183): a breadcrumb and document-actions
 * strip — sticky, so it survives the scroll a cinematic hero otherwise
 * demands back every visit — over the cinematic hero itself, reusing #133's
 * `WorkspaceHeader` rather than a second implementation.
 *
 * The strip absorbs what #182, #184 and #187 already built into this header
 * (`DocumentSwitcher`, the archived badge, History, Review, Ask AI) instead of
 * duplicating them, and adds the version pill, Compare and Export entry
 * points the mockup (`docs/mockups/gdd-workspace.png`) asks for.
 *
 * Publish and Share are deliberately absent: neither has a model yet
 * (no publication state, no sharing outside the project), and a button that
 * does nothing is worse than a gap. Export (#190) is the one that shipped:
 * `ExportMenu` in place of the disabled button that used to hold its spot.
 *
 * Find (#191) opens `findBar` as an extra row of this same sticky strip
 * rather than a sibling of its own — two independently `sticky` elements
 * stack on top of each other, not below one another, so the field the writer
 * is stepping through stays pinned however far they scroll to reach a match.
 */
export function GddDocumentHeader({
  projectId,
  project,
  documentEntity,
  currentVersion,
  archived,
  comparing,
  onToggleCompare,
  onToggleHistory,
  onToggleReview,
  onToggleAskAi,
  onToggleFind,
  findBar,
  onExport,
}: {
  projectId: string;
  /** Undefined while the project is still loading; the header degrades gracefully. */
  project: Project | undefined;
  documentEntity: Entity;
  /** The version history's newest entry (#184), or null before a document has any. */
  currentVersion: DocumentVersion | null;
  archived: boolean;
  comparing: boolean;
  onToggleCompare: () => void;
  onToggleHistory: () => void;
  onToggleReview: () => void;
  onToggleAskAi: () => void;
  onToggleFind: () => void;
  /** The find-in-document field (`GddFindBar`), or null while it is closed. */
  findBar?: ReactNode;
  onExport: (format: DocumentExportFormat) => void;
}) {
  const projectHref = `/projects/${projectId}` as Route;

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border-subtle bg-surface px-4 py-3 xl:px-5 2xl:px-6">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1 text-xs text-muted-foreground"
        >
          <Link href={'/' as Route} className="hover:text-foreground hover:underline">
            Projects
          </Link>
          <ChevronRightIcon className="size-3.5 shrink-0 text-faint-foreground" />
          <Link href={projectHref} className="truncate hover:text-foreground hover:underline">
            {project?.name ?? 'Project'}
          </Link>
          <ChevronRightIcon className="size-3.5 shrink-0 text-faint-foreground" />
          <span className="text-foreground">GDD</span>
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <DocumentSwitcher projectId={projectId} current={documentEntity} />
            {archived && <StatusBadge tone="neutral">Archived</StatusBadge>}
            {currentVersion && <Tag>v{currentVersion.versionNumber}</Tag>}
          </div>

          <div className="flex items-center gap-2">
            {comparing ? (
              <Button variant="secondary" size="sm" onClick={onToggleCompare}>
                Back to writing
              </Button>
            ) : (
              <>
                <Button variant="secondary" size="sm" onClick={onToggleHistory}>
                  <HistoryIcon className="size-4" />
                  History
                </Button>
                <Button variant="secondary" size="sm" onClick={onToggleFind}>
                  <SearchIcon className="size-4" />
                  Find
                </Button>
                <Button variant="secondary" size="sm" onClick={onToggleCompare}>
                  Compare
                </Button>
                {/* Outside the archived guard, unlike Ask AI: archiving freezes
                    the prose and not the conversation about it, and this is the
                    only way in once the toolbar's Comment button is hidden. */}
                <Button variant="secondary" size="sm" onClick={onToggleReview}>
                  <CommentIcon className="size-4" />
                  Review
                </Button>
                <ExportMenu onExport={onExport} />
                {!archived && (
                  <Button variant="ai" size="sm" onClick={onToggleAskAi}>
                    <SparklesIcon className="size-4" />
                    Ask AI
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {!comparing && findBar}
      </div>

      <WorkspaceHeader
        title={project?.name ?? 'Untitled game'}
        description={project?.description ?? undefined}
        cinematic
      />
    </>
  );
}
