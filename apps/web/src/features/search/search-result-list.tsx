'use client';

import type { SearchResult, SearchSourceType } from '@level-zero/domain';
import { EntityCard } from '@level-zero/ui';

import { entityStatusBadge, entityTypeLabel } from '@/features/entities/entity-presentation';

/** What a hit's "type" line says when the record behind it is not an entity. */
const SOURCE_LABELS: Record<Exclude<SearchSourceType, 'entity'>, string> = {
  asset: 'Asset',
  generation: 'Generation',
};

/**
 * A result list of mixed types (spec section 58).
 *
 * Every hit reads the same — name, then "Type • Project" — so a character, a
 * GDD section and an asset are comparable at a glance rather than each needing
 * their own card.
 */
export function SearchResultList({
  results,
  projectName,
}: {
  results: readonly SearchResult[];
  projectName: string;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {results.map((result) => (
        <li key={`${result.sourceType}:${result.sourceId}`}>
          <EntityCard
            name={result.title}
            typeLabel={`${typeLabel(result)} • ${projectName}`}
            status={
              result.sourceType === 'entity' && isEntityStatus(result.status)
                ? entityStatusBadge(result.status)
                : undefined
            }
            description={result.excerpt || null}
            tags={result.tags}
          />
        </li>
      ))}
    </ul>
  );
}

function typeLabel(result: SearchResult): string {
  if (result.sourceType === 'entity') {
    return result.entityType ? entityTypeLabel(result.entityType) : 'Entity';
  }
  return SOURCE_LABELS[result.sourceType];
}

function isEntityStatus(status: string): status is 'draft' | 'active' | 'archived' {
  return status === 'draft' || status === 'active' || status === 'archived';
}
