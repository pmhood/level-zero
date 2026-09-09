import { CharactersWorkspace } from '@/features/characters/characters-workspace';

export default async function CharactersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return <CharactersWorkspace projectId={projectId} />;
}
