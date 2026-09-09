import type { Project } from '@level-zero/domain';
import { cardVariants, StatusBadge } from '@level-zero/ui';
import Link from 'next/link';

import { projectStatusBadge } from './project-presentation';

export function ProjectCard({ project }: { project: Project }) {
  const status = projectStatusBadge(project.status);

  return (
    <Link
      href={`/projects/${project.id}`}
      className={cardVariants({ interactive: true, padding: 'md' })}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-[15px] font-semibold text-foreground">{project.name}</h3>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>
      {project.description && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
      )}
    </Link>
  );
}
