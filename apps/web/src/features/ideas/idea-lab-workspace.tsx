'use client';

import type { Entity } from '@level-zero/domain';
import { Button, EmptyState, Inspector, PlusIcon, WorkspaceHeader } from '@level-zero/ui';
import { useMemo, useState } from 'react';

import { AiInspector } from '@/features/ai-inspector/ai-inspector';
import { ApiRequestError } from '@/lib/api';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { IdeaCardGrid, IdeaCardGridSkeleton } from './idea-card-grid';
import { IdeaComposer } from './idea-composer';
import { IdeaInspector } from './idea-inspector';
import { IdeaToolbar } from './idea-toolbar';
import { uniqueIdeaTags } from './idea-tags';
import { useIdeas, type IdeaTab } from './use-ideas';

export function IdeaLabWorkspace({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<IdeaTab>('ideas');
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selected, setSelected] = useState<Entity | null>(null);

  const debouncedSearch = useDebouncedValue(search, 250);
  const ideasQuery = useIdeas(projectId, {
    tab,
    search: debouncedSearch.trim() || undefined,
    tag: activeTag ?? undefined,
  });

  const ideas = ideasQuery.data?.items ?? [];
  const tags = useMemo(() => uniqueIdeaTags(ideas), [ideas]);
  const isFiltered = Boolean(debouncedSearch.trim()) || Boolean(activeTag);

  function switchTab(nextTab: IdeaTab) {
    setTab(nextTab);
    setActiveTag(null);
    setSelected(null);
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <WorkspaceHeader
          title="Idea Lab"
          description="Turn rough thoughts into design directions. Promote what sticks."
          actions={
            <Button onClick={() => setSelected(null)}>
              <PlusIcon className="size-4" />
              New idea
            </Button>
          }
        />

        <div className="flex flex-col gap-4 px-4 pb-8 xl:px-5 2xl:px-6">
          <IdeaToolbar
            tab={tab}
            onTabChange={switchTab}
            search={search}
            onSearchChange={setSearch}
            tags={tags}
            activeTag={activeTag}
            onTagChange={setActiveTag}
          />

          {ideasQuery.isPending && <IdeaCardGridSkeleton />}

          {ideasQuery.isError && (
            <EmptyState
              title="Couldn't load ideas"
              description={
                ideasQuery.error instanceof ApiRequestError
                  ? ideasQuery.error.message
                  : 'Something went wrong talking to the API.'
              }
              actions={
                <Button variant="secondary" onClick={() => ideasQuery.refetch()}>
                  Try again
                </Button>
              }
            />
          )}

          {ideasQuery.isSuccess && ideas.length === 0 && tab === 'ideas' && !isFiltered && (
            <EmptyState
              title="No ideas yet"
              description="Capture a rough thought — a name and a sentence are enough to start."
              actions={
                <Button onClick={() => setSelected(null)}>
                  <PlusIcon className="size-4" />
                  New idea
                </Button>
              }
            />
          )}

          {ideasQuery.isSuccess && ideas.length === 0 && (tab === 'archived' || isFiltered) && (
            <EmptyState
              title={tab === 'archived' ? 'No archived ideas' : 'No ideas match your filters'}
              description={
                tab === 'archived'
                  ? 'Ideas you archive show up here, ready to restore.'
                  : 'Try a different search term or clear the tag filter.'
              }
            />
          )}

          {ideasQuery.isSuccess && ideas.length > 0 && (
            <IdeaCardGrid ideas={ideas} selectedId={selected?.id ?? null} onSelect={setSelected} />
          )}
        </div>
      </div>

      {selected ? (
        <IdeaInspector
          projectId={projectId}
          idea={selected}
          onClose={() => setSelected(null)}
          onArchived={() => setSelected(null)}
          onRestored={() => setSelected(null)}
        />
      ) : (
        <Inspector title="New idea" description="Idea Lab">
          <IdeaComposer projectId={projectId} onCreated={setSelected} />

          {/* Nothing is selected, so the contextual AI is about the project
              itself — and an answer kept from here lands in this very grid. */}
          <div className="mt-5 border-t border-border-subtle pt-4">
            <AiInspector projectId={projectId} subject={{ kind: 'project' }} />
          </div>
        </Inspector>
      )}
    </div>
  );
}
