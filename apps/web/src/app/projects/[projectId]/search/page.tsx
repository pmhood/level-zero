import { SearchWorkspace } from '@/features/search/search-workspace';

export default async function SearchPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  return <SearchWorkspace projectId={projectId} />;
}
