import { WorldWorkspace } from '@/features/world/world-workspace';

export default async function WorldPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  return <WorldWorkspace projectId={projectId} />;
}
