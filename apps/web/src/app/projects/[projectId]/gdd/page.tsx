import { GddWorkspace } from '@/features/gdd/gdd-workspace';

export default async function GddPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  return <GddWorkspace projectId={projectId} />;
}
