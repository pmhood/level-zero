import { IdeaLabWorkspace } from '@/features/ideas/idea-lab-workspace';

export default async function IdeaLabPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  return <IdeaLabWorkspace projectId={projectId} />;
}
