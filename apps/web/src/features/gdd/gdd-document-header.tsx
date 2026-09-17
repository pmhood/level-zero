'use client';

import type { DocumentVersion, Entity, Project } from '@level-zero/domain';
import {
  Button,
  ChevronRightIcon,
  DownloadIcon,
  HistoryIcon,
  SparklesIcon,
  StatusBadge,
  Tag,
  WorkspaceHeader,
} from '@level-zero/ui';
import type { Route } from 'next';
import Link from 'next/link';

import { DocumentSwitcher } from './document-switcher';

/**
 * The GDD's document header (issue #183): a breadcrumb and document-actions
 * strip — sticky, so it survives the scroll a cinematic hero otherwise
 * demands back every visit — over the cinematic hero itself, reusing #133's
 * `WorkspaceHeader` rather than a second implementation.
 *
 * The strip absorbs what #182 and #184 already built into this header
 * (`DocumentSwitcher`, the archived badge, History, Ask AI) instead of
 * duplicating them, and adds the version pill, Compare and Export entry
 * points the mockup (`docs/mockups/gdd-workspace.png`) asks for.
 *
 * Publish and Share are deliberately absent: neither has a model yet
 * (no publication state, no sharing outside the project), and a button that
 * does nothing is worse than a gap. Export does not exist yet either (#190),
 * but — unlike Publish and Share — it is scoped and coming, so it gets a
 * disabled place in the strip rather than no place at all.
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
  onToggleAskAi,
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
  onToggleAskAi: () => void;
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
                <Button variant="secondary" size="sm" onClick={onToggleCompare}>
                  Compare
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled
                  title="Exporting a document is coming soon"
                >
                  <DownloadIcon className="size-4" />
                  Export
                </Button>
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
      </div>

      <WorkspaceHeader
        title={project?.name ?? 'Untitled game'}
        description={project?.description ?? undefined}
        cinematic
      />
    </>
  );
}
