'use client';

import type { Entity } from '@level-zero/domain';
import { Button, Input, PlusIcon, Textarea } from '@level-zero/ui';
import { useState, type FormEvent } from 'react';

import { TagInput } from '@/components/tag-input';
import { ApiRequestError } from '@/lib/api';

import { useCreateIdea } from './use-ideas';

/**
 * Shown in the inspector when nothing is selected: page-level assistance
 * rather than an empty panel (spec section 34/56).
 */
export function IdeaComposer({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated?: (idea: Entity) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const createIdea = useCreateIdea(projectId);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    createIdea.mutate(
      { name: trimmedName, description: description.trim() || null, tags },
      {
        onSuccess: (idea) => {
          setName('');
          setDescription('');
          setTags([]);
          onCreated?.(idea);
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Capture a rough thought. You can shape it later — name and a sentence are enough to start.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="idea-name" className="text-xs font-medium text-muted-foreground">
          Name
        </label>
        <Input
          id="idea-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="What if the game about..."
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="idea-description" className="text-xs font-medium text-muted-foreground">
          Description
        </label>
        <Textarea
          id="idea-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What makes it interesting?"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Tags</span>
        <TagInput tags={tags} onChange={setTags} />
      </div>

      {createIdea.isError && (
        <p className="text-xs text-error">
          {createIdea.error instanceof ApiRequestError
            ? createIdea.error.message
            : 'Could not save this idea.'}
        </p>
      )}

      <Button type="submit" disabled={createIdea.isPending || name.trim().length === 0}>
        <PlusIcon className="size-4" />
        {createIdea.isPending ? 'Saving…' : 'Save idea'}
      </Button>
    </form>
  );
}
