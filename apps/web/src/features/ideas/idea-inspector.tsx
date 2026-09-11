'use client';

import { promotionsFor, type Entity } from '@level-zero/domain';
import {
  Button,
  HistoryIcon,
  Input,
  Inspector,
  PromoteAction,
  Tabs,
  Tag,
  Textarea,
} from '@level-zero/ui';
import { useState, type FormEvent } from 'react';

import { TagInput } from '@/components/tag-input';
import { ApiRequestError } from '@/lib/api';

import { IdeaLineageList } from './idea-lineage';
import { IdeaNotes } from './idea-notes';
import {
  useArchiveIdea,
  useEntityNeighborhood,
  usePromoteIdea,
  useRestoreIdea,
  useUpdateIdea,
} from './use-ideas';

function IdeaDetailsForm({ projectId, idea }: { projectId: string; idea: Entity }) {
  const [name, setName] = useState(idea.name);
  const [description, setDescription] = useState(idea.description ?? '');
  const [tags, setTags] = useState(idea.tags);
  const updateIdea = useUpdateIdea(projectId);
  const promoteIdea = usePromoteIdea(projectId);
  const [promoted, setPromoted] = useState<string | null>(null);

  const archived = idea.status === 'archived';
  const dirty =
    name !== idea.name ||
    description !== (idea.description ?? '') ||
    tags.join() !== idea.tags.join();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (archived || !dirty || name.trim().length === 0) return;
    updateIdea.mutate({
      entityId: idea.id,
      patch: { name: name.trim(), description: description.trim() || null, tags },
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <fieldset disabled={archived} className="flex flex-col gap-3 disabled:opacity-60">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="idea-detail-name" className="text-xs font-medium text-muted-foreground">
              Name
            </label>
            <Input
              id="idea-detail-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="idea-detail-description"
              className="text-xs font-medium text-muted-foreground"
            >
              Description
            </label>
            <Textarea
              id="idea-detail-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Tags</span>
            <TagInput tags={tags} onChange={setTags} />
          </div>
        </fieldset>

        {archived && (
          <p className="text-xs text-faint-foreground">Restore this idea before editing it.</p>
        )}

        {updateIdea.isError && (
          <p className="text-xs text-error">
            {updateIdea.error instanceof ApiRequestError
              ? updateIdea.error.message
              : 'Could not save.'}
          </p>
        )}

        {!archived && (
          <Button
            type="submit"
            size="sm"
            disabled={!dirty || updateIdea.isPending || name.trim().length === 0}
          >
            {updateIdea.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        )}
      </form>

      <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
        <span className="text-xs font-medium text-muted-foreground">Promote</span>
        <p className="text-xs text-faint-foreground">
          Creates a new entity and keeps this idea exactly as it is.
        </p>
        <div className="flex flex-wrap gap-2">
          {promotionsFor('idea').map((promotion) => (
            <PromoteAction
              key={promotion.targetType}
              from="idea"
              to={promotion.targetType}
              label={promotion.label}
              size="sm"
              pending={
                promoteIdea.isPending &&
                promoteIdea.variables?.input.type === promotion.targetType
              }
              onPromote={() =>
                promoteIdea.mutate(
                  { entityId: idea.id, input: { type: promotion.targetType } },
                  { onSuccess: (result) => setPromoted(result.promoted.name) },
                )
              }
            />
          ))}
        </div>
        {promoted && <p className="text-xs text-success">Promoted to “{promoted}”.</p>}
        {promoteIdea.isError && (
          <p className="text-xs text-error">
            {promoteIdea.error instanceof ApiRequestError
              ? promoteIdea.error.message
              : 'Could not promote.'}
          </p>
        )}
      </div>
    </div>
  );
}

function IdeaLinksTab({ projectId, ideaId }: { projectId: string; ideaId: string }) {
  const neighborhood = useEntityNeighborhood(projectId, ideaId);

  if (neighborhood.isPending) {
    return <p className="text-sm text-muted-foreground">Loading relationships…</p>;
  }

  if (neighborhood.isError) {
    return <p className="text-sm text-error">Could not load relationships.</p>;
  }

  return (
    <IdeaLineageList outgoing={neighborhood.data.outgoing} incoming={neighborhood.data.incoming} />
  );
}

type IdeaInspectorTab = 'details' | 'notes' | 'links';

export function IdeaInspector({
  projectId,
  idea,
  onClose,
  onArchived,
  onRestored,
}: {
  projectId: string;
  idea: Entity;
  onClose: () => void;
  onArchived: () => void;
  onRestored: () => void;
}) {
  const [tab, setTab] = useState<IdeaInspectorTab>('details');
  const archiveIdea = useArchiveIdea(projectId);
  const restoreIdea = useRestoreIdea(projectId);
  const archived = idea.status === 'archived';

  return (
    <Inspector title={idea.name} description="Idea" onClose={onClose} key={idea.id}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Tabs
          value={tab}
          onChange={(value) => setTab(value as IdeaInspectorTab)}
          items={[
            { value: 'details', label: 'Details' },
            { value: 'notes', label: 'Notes' },
            { value: 'links', label: 'Links' },
          ]}
        />
        {archived ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => restoreIdea.mutate(idea.id, { onSuccess: onRestored })}
            disabled={restoreIdea.isPending}
          >
            <HistoryIcon className="size-4" />
            Restore
          </Button>
        ) : (
          <Button
            variant="danger"
            size="sm"
            onClick={() => archiveIdea.mutate(idea.id, { onSuccess: onArchived })}
            disabled={archiveIdea.isPending}
          >
            Archive
          </Button>
        )}
      </div>

      {archived && <Tag className="mb-3">Archived</Tag>}

      {tab === 'details' && <IdeaDetailsForm projectId={projectId} idea={idea} />}
      {tab === 'notes' && <IdeaNotes key={idea.id} projectId={projectId} idea={idea} />}
      {tab === 'links' && <IdeaLinksTab projectId={projectId} ideaId={idea.id} />}
    </Inspector>
  );
}
