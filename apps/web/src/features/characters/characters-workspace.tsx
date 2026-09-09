'use client';

import type { Entity } from '@level-zero/domain';
import { Button, EmptyState, Inspector, PlusIcon, WorkspacePage } from '@level-zero/ui';
import { useMemo, useState } from 'react';

import { apiErrorMessage } from '@/lib/api';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { characterRoles, characterTags, narrowCharacters } from './character';
import {
  CharacterBrowser,
  EMPTY_CHARACTER_FILTERS,
  type CharacterBrowserFilters,
} from './character-browser';
import { CharacterComposer } from './character-composer';
import { CharacterDetail } from './character-detail';
import { CharacterInspector } from './character-inspector';
import { useCharacter, useCharacters } from './use-characters';

/**
 * Character Studio: a browser of the project's cast, the detail surface for
 * the one in hand, and an inspector for what can be done with them
 * (UX spec, "Characters").
 *
 * Everything here is a canonical entity of type `character`. The workspace is
 * a view over the graph — never a second place characters live.
 */
export function CharactersWorkspace({ projectId }: { projectId: string }) {
  const [filters, setFilters] = useState<CharacterBrowserFilters>(EMPTY_CHARACTER_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(filters.search, 250);
  const charactersQuery = useCharacters(projectId, {
    lifecycle: filters.lifecycle,
    search: debouncedSearch.trim() || undefined,
  });
  const selectedQuery = useCharacter(projectId, selectedId);

  const characters = useMemo(() => charactersQuery.data?.items ?? [], [charactersQuery.data]);
  const visible = useMemo(
    () =>
      narrowCharacters(characters, {
        role: filters.role || undefined,
        tag: filters.tag || undefined,
      }),
    [characters, filters.role, filters.tag],
  );

  function select(character: Entity) {
    setSelectedId(character.id);
  }

  const selected = selectedQuery.data ?? null;

  return (
    <WorkspacePage
      title="Characters"
      description="People drive the story. Design, develop and bring your cast to life."
      actions={
        <Button onClick={() => setSelectedId(null)}>
          <PlusIcon className="size-4" />
          New character
        </Button>
      }
      inspector={
        selected ? (
          <CharacterInspector
            projectId={projectId}
            character={selected}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <Inspector title="New character" description="Characters">
            <CharacterComposer projectId={projectId} onCreated={select} />
          </Inspector>
        )
      }
    >
      <CharacterBrowser
        characters={visible}
        roles={characterRoles(characters)}
        tags={characterTags(characters)}
        isPending={charactersQuery.isPending}
        error={charactersQuery.error}
        onRetry={() => void charactersQuery.refetch()}
        filters={filters}
        onFiltersChange={setFilters}
        selectedId={selectedId}
        onSelect={select}
        onCreate={() => setSelectedId(null)}
      />

      <CharacterDetailPane
        projectId={projectId}
        character={selected}
        isPending={Boolean(selectedId) && selectedQuery.isPending}
        error={selectedQuery.error}
      />
    </WorkspacePage>
  );
}

function CharacterDetailPane({
  projectId,
  character,
  isPending,
  error,
}: {
  projectId: string;
  character: Entity | null;
  isPending: boolean;
  error: unknown;
}) {
  if (isPending) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading character…</p>
      </div>
    );
  }

  if (error != null) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center p-5">
        <EmptyState title="Couldn't load this character" description={apiErrorMessage(error)} />
      </div>
    );
  }

  if (!character) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center p-5">
        <EmptyState
          title="Nobody selected"
          description="Pick someone to see their visuals, background and what they are bound to — or start a new character from the panel on the right."
        />
      </div>
    );
  }

  return <CharacterDetail key={character.id} projectId={projectId} character={character} />;
}
