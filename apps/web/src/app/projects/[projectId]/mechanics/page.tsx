import { MechanicsWorkspace } from '@/features/mechanics/mechanics-workspace';

export default async function MechanicsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return <MechanicsWorkspace projectId={projectId} />;
}
