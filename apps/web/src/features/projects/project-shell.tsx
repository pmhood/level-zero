'use client';

import { AppShell, Button, EmptyState, Topbar } from '@level-zero/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ApiRequestError } from '@/lib/api';

import { ProjectSidebar } from './project-sidebar';
import { useProject } from './use-projects';

/**
 * The project overview shell: sidebar, topbar and the fluid workspace, shared
 * by every project tool (spec section 5). Overview, Idea Lab, Mechanics and
 * the GDD are the destinations that exist so far.
 */
export function ProjectShell({ projectId, children }: { projectId: string; children: ReactNode }) {
  const projectQuery = useProject(projectId);

  if (projectQuery.isPending) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading project…
      </div>
    );
  }

  if (projectQuery.isError) {
    const notFound =
      projectQuery.error instanceof ApiRequestError && projectQuery.error.status === 404;

    return (
      <div className="flex h-screen items-center justify-center p-6">
        <EmptyState
          title={notFound ? 'Project not found' : "Couldn't load this project"}
          description={
            notFound
              ? "This project doesn't exist, or you don't have access to it."
              : projectQuery.error instanceof ApiRequestError
                ? projectQuery.error.message
                : 'Something went wrong talking to the API.'
          }
          actions={
            <Button asChild variant="secondary">
              <Link href="/">Back to projects</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const project = projectQuery.data;

  return (
    <AppShell
      sidebar={<ProjectSidebar projectId={projectId} projectName={project.name} />}
      topbar={<Topbar breadcrumb={project.name} />}
    >
      {children}
    </AppShell>
  );
}
