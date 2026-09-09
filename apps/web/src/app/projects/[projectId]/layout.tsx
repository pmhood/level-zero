import type { ReactNode } from 'react';

import { ProjectShell } from '@/features/projects/project-shell';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return <ProjectShell projectId={projectId}>{children}</ProjectShell>;
}
