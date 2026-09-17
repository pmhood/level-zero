import { GddWorkspace } from '@/features/gdd/gdd-workspace';

export default async function GddDocumentPage({
  params,
}: {
  params: Promise<{ projectId: string; documentId: string }>;
}) {
  const { projectId, documentId } = await params;

  return <GddWorkspace projectId={projectId} documentId={documentId} />;
}
