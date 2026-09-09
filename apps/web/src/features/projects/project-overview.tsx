'use client';

import { Button, EntityCard, IdeaLabIcon, SectionPanel, WorkspaceHeader } from '@level-zero/ui';
import type { Route } from 'next';
import Link from 'next/link';

import { entityStatusBadge } from '@/features/entities/entity-presentation';
import { useEntitiesByType } from '@/features/entities/use-entities';

import { useProject } from './use-projects';

/**
 * The project's creative command center (page-by-page spec, "Project
 * Overview"). Scoped to what this issue actually has data for: the project
 * itself and design pillars, which are promoted ideas rather than loose
 * notes. Open questions, world snapshot and key characters return once those
 * tools exist.
 */
export function ProjectOverview({ projectId }: { projectId: string }) {
  const projectQuery = useProject(projectId);
  const pillarsQuery = useEntitiesByType(projectId, 'design_pillar');
  const project = projectQuery.data;
  const ideaLabHref = `/projects/${projectId}/idea-lab` as Route;

  return (
    <div className="h-full overflow-y-auto">
      <WorkspaceHeader
        title={project?.name ?? 'Project'}
        description={project?.description ?? 'Creative command center for this game.'}
        actions={
          <Button asChild>
            <Link href={ideaLabHref}>
              <IdeaLabIcon className="size-4" />
              Open Idea Lab
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-4 px-4 pb-8 xl:px-5 2xl:px-6">
        <SectionPanel
          title="Design Pillars"
          description="Promoted ideas that anchor this game's direction."
        >
          {pillarsQuery.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}

          {pillarsQuery.isError && (
            <p className="text-sm text-error">Couldn&rsquo;t load design pillars.</p>
          )}

          {pillarsQuery.isSuccess && pillarsQuery.data.items.length === 0 && (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">
                No design pillars yet. Promote an idea in the Idea Lab to anchor your game&rsquo;s
                direction here.
              </p>
              <Button variant="secondary" asChild>
                <Link href={ideaLabHref}>Go to Idea Lab</Link>
              </Button>
            </div>
          )}

          {pillarsQuery.isSuccess && pillarsQuery.data.items.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {pillarsQuery.data.items.map((pillar) => (
                <EntityCard
                  key={pillar.id}
                  name={pillar.name}
                  typeLabel="Design Pillar"
                  status={entityStatusBadge(pillar.status)}
                  description={pillar.description}
                  tags={pillar.tags}
                />
              ))}
            </div>
          )}
        </SectionPanel>
      </div>
    </div>
  );
}
