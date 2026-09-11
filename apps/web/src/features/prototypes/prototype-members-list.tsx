import type { EntityVersion, PrototypeMember } from '@level-zero/domain';
import { Button } from '@level-zero/ui';
import type { Route } from 'next';
import Link from 'next/link';

import { entityRoute } from '@/features/entity-detail/entity-route';

/**
 * The exact entity versions a prototype version pins, in the order they were
 * captured — requirement "inspect its exact pinned EntityVersions".
 *
 * Every row deep-links to the canonical entity route rather than rendering a
 * copy of its content; a pin whose entity version no longer resolves (an
 * out-of-scope archive) still gets a row rather than disappearing silently.
 */
export function PrototypeMembersList({
  projectId,
  members,
  entityVersions,
}: {
  projectId: string;
  members: readonly PrototypeMember[];
  entityVersions: readonly EntityVersion[];
}) {
  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">No entities pinned to this version.</p>;
  }

  const byVersionId = new Map(entityVersions.map((version) => [version.id, version]));

  return (
    <ul className="flex flex-col gap-2">
      {members.map((member) => {
        const version = byVersionId.get(member.entityVersionId);

        return (
          <li
            key={member.entityId}
            className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-raised px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">
                {version?.snapshot.name ?? 'Not available'}
              </p>
              <p className="text-xs text-faint-foreground">
                {version ? `v${version.versionNumber}` : 'This pin no longer resolves'}
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href={entityRoute(projectId, member.entityId) as Route}>Open</Link>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
