'use client';

import { Button, EmptyState } from '@level-zero/ui';

import { ApiRequestError } from '@/lib/api';

import { ProjectCard } from './project-card';
import { useProjects } from './use-projects';

function ProjectCardSkeleton() {
  return (
    <div className="h-[92px] animate-pulse rounded-lg border border-border bg-surface p-3">
      <div className="h-4 w-1/2 rounded bg-raised" />
      <div className="mt-3 h-3 w-full rounded bg-raised" />
    </div>
  );
}

export function ProjectList() {
  const projectsQuery = useProjects({ limit: 50 });

  if (projectsQuery.isPending) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <ProjectCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (projectsQuery.isError) {
    return (
      <EmptyState
        title="Couldn't load your projects"
        description={
          projectsQuery.error instanceof ApiRequestError
            ? projectsQuery.error.message
            : 'Something went wrong talking to the API.'
        }
        actions={
          <Button variant="secondary" onClick={() => projectsQuery.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const projects = projectsQuery.data.items;

  if (projects.length === 0) {
    return (
      <EmptyState
        title="No projects yet"
        description="Create a project to start capturing ideas for your next game."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
