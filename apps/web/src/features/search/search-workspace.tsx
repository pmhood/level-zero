'use client';

import type { EntityType } from '@level-zero/domain';
import { Button, EmptyState, Input, Tabs, Tag, WorkspaceHeader } from '@level-zero/ui';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { entityTypeLabel } from '@/features/entities/entity-presentation';
import { useProject } from '@/features/projects/use-projects';
import { ApiRequestError, type SearchParams } from '@/lib/api';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { SearchResultList } from './search-result-list';
import { useProjectSearch } from './use-search';

const MODES: { value: NonNullable<SearchParams['mode']>; label: string }[] = [
  { value: 'keyword', label: 'Keyword' },
  { value: 'semantic', label: 'Related' },
];

/** The entity types worth offering as a scope; the rest are reachable unscoped. */
const SCOPES: EntityType[] = ['idea', 'character', 'location', 'mechanic', 'document'];

/**
 * One way in to everything in the project (spec section 58).
 *
 * The same question can be asked two ways: `Keyword` matches the words that
 * were typed, `Related` matches what they mean, so "the mechanic where oxygen
 * limits exploration" can reach a design that never uses those words. Scoping
 * to one entity type is the local, per-tool search the spec describes.
 *
 * `?sourceType=asset` seeds an initial "Assets only" scope — the Asset
 * Library toolbar's (#172) link into content search, since #41's
 * `search_documents` remains the project's only search index and the library
 * has no second one of its own. This only seeds the request; there is no
 * broader source-type picker here; wiring one is more than the small
 * addition #172 scoped itself to.
 */
export function SearchWorkspace({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<NonNullable<SearchParams['mode']>>('keyword');
  const [scope, setScope] = useState<EntityType | null>(null);
  const [assetsOnly, setAssetsOnly] = useState(() => searchParams.get('sourceType') === 'asset');

  const debounced = useDebouncedValue(question, 250);
  const projectQuery = useProject(projectId);
  const params: SearchParams = {
    q: debounced.trim() || undefined,
    mode,
    entityType: scope ? [scope] : undefined,
    sourceType: assetsOnly && !scope ? ['asset'] : undefined,
    limit: 50,
  };
  const resultsQuery = useProjectSearch(projectId, params);

  const results = resultsQuery.data?.items ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <WorkspaceHeader
        title="Search"
        description="Everything in this project — ideas, designs, documents, assets and generations."
      />

      <div className="flex flex-col gap-4 px-4 pb-8 xl:px-5 2xl:px-6">
        <Input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Search this project…"
          aria-label="Search this project"
        />

        <Tabs
          items={MODES}
          value={mode}
          onChange={(next) => setMode(next as NonNullable<SearchParams['mode']>)}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <ScopeButton
            label="Everything"
            active={scope === null && !assetsOnly}
            onClick={() => {
              setScope(null);
              setAssetsOnly(false);
            }}
          />
          {SCOPES.map((type) => (
            <ScopeButton
              key={type}
              label={entityTypeLabel(type)}
              active={scope === type}
              onClick={() => setScope(type)}
            />
          ))}
          {assetsOnly && !scope && (
            <Tag onRemove={() => setAssetsOnly(false)}>Assets only</Tag>
          )}
        </div>

        {resultsQuery.isError && (
          <EmptyState
            title="Couldn't search this project"
            description={
              resultsQuery.error instanceof ApiRequestError
                ? resultsQuery.error.message
                : 'Something went wrong talking to the API.'
            }
            actions={
              <Button variant="secondary" onClick={() => resultsQuery.refetch()}>
                Try again
              </Button>
            }
          />
        )}

        {!resultsQuery.isError && results.length === 0 && (
          <EmptyState
            title={debounced.trim() ? 'Nothing matched' : 'Search the whole project'}
            description={
              debounced.trim()
                ? 'Try fewer words, a different scope, or the Related tab, which matches meaning rather than spelling.'
                : 'Type a name, a phrase, or a description of what you are looking for.'
            }
          />
        )}

        {results.length > 0 && (
          <SearchResultList
            results={results}
            projectId={projectId}
            projectName={projectQuery.data?.name ?? 'Project'}
          />
        )}
      </div>
    </div>
  );
}

function ScopeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
