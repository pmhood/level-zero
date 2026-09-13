'use client';

import type { SearchResult, SearchSourceType } from '@level-zero/domain';
import { EntityCard } from '@level-zero/ui';
import type { Route } from 'next';
import Link from 'next/link';

import { entityStatusBadge, entityTypeLabel } from '@/features/entities/entity-presentation';
import { entityRoute } from '@/features/entity-detail/entity-route';

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
 *
 * An entity hit opens the canonical entity route
 * (docs/decisions/canonical-entity-routes.md §2.6) — search was previously a
 * dead end. Asset and generation hits stay display-only: neither is an
 * entity, so neither has a canonical address to open.
 */
export function SearchResultList({
  results,
  projectId,
  projectName,
}: {
  results: readonly SearchResult[];
  projectId: string;
  projectName: string;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {results.map((result) => (
        <li key={`${result.sourceType}:${result.sourceId}`}>
          {result.sourceType === 'entity' ? (
            <Link
              href={entityRoute(projectId, result.sourceId) as Route}
              className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <EntityCard
                name={result.title}
                typeLabel={`${typeLabel(result)} • ${projectName}`}
                status={
                  isEntityStatus(result.status) ? entityStatusBadge(result.status) : undefined
                }
                description={result.excerpt || null}
                tags={result.tags}
                className="hover:border-border-strong hover:bg-hover"
              />
            </Link>
          ) : (
            <EntityCard
              name={result.title}
              typeLabel={`${typeLabel(result)} • ${projectName}`}
              description={result.excerpt || null}
              tags={result.tags}
            />
          )}
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
