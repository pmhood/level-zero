'use client';

import { WarningIcon, cn } from '@level-zero/ui';
import type { Route } from 'next';
import Link from 'next/link';

import { useEntityFindings } from './use-findings';

/**
 * The contextual entry point to the Consistency surface from wherever a
 * document names this entity — the "documents" half of the issue's
 * "contextual entry points from affected entities and documents". Renders
 * nothing when the entity has no open finding, so an entity nothing
 * disagrees about carries no extra weight.
 */
export function EntityConsistencyNotice({
  projectId,
  entityId,
  className,
}: {
  projectId: string;
  entityId: string;
  className?: string;
}) {
  const findingsQuery = useEntityFindings(projectId, entityId);
  const count = findingsQuery.data?.length ?? 0;

  if (count === 0) return null;

  return (
    <Link
      href={`/projects/${projectId}/consistency` as Route}
      className={cn(
        'mt-1 flex items-center gap-1.5 text-xs font-medium text-warning hover:underline',
        className,
      )}
    >
      <WarningIcon className="size-3.5" />
      {count === 1 ? 'Open consistency finding' : `${count} open consistency findings`}
    </Link>
  );
}
