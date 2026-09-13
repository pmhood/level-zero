import { Suspense } from 'react';

import { AssetsWorkspace } from '@/features/assets/assets-workspace';

export default async function AssetsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  return (
    <Suspense>
      <AssetsWorkspace projectId={projectId} />
    </Suspense>
  );
}
