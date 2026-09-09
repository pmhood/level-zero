import { MoodboardsWorkspace } from '@/features/moodboards/moodboards-workspace';

export default async function MoodboardsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <MoodboardsWorkspace projectId={projectId} />;
}
