import { PrototypesWorkspace } from '@/features/prototypes/prototypes-workspace';

export default async function PrototypesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return <PrototypesWorkspace projectId={projectId} />;
}
