import { ConsistencyWorkspace } from '@/features/consistency/consistency-workspace';

export default async function ConsistencyPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return <ConsistencyWorkspace projectId={projectId} />;
}
