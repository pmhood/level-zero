import { EntityDetailPage } from '@/features/entity-detail/entity-detail-page';

export default async function EntityPage({
  params,
}: {
  params: Promise<{ projectId: string; entityId: string }>;
}) {
  const { projectId, entityId } = await params;

  return <EntityDetailPage projectId={projectId} entityId={entityId} />;
}
