'use client';

import { Button, Input, PlusIcon, SectionPanel, Textarea } from '@level-zero/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiRequestError } from '@/lib/api';

import { useCreateProject } from './use-projects';

export function CreateProjectPanel() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const createProject = useCreateProject();
  const router = useRouter();

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <PlusIcon className="size-4" />
        New project
      </Button>
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    createProject.mutate(
      { name: trimmedName, description: description.trim() || null },
      {
        onSuccess: (project) => {
          setName('');
          setDescription('');
          setOpen(false);
          router.push(`/projects/${project.id}`);
        },
      },
    );
  }

  return (
    <SectionPanel title="New project" className="max-w-md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="project-name" className="text-xs font-medium text-muted-foreground">
            Name
          </label>
          <Input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Driftwake"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="project-description"
            className="text-xs font-medium text-muted-foreground"
          >
            Description
          </label>
          <Textarea
            id="project-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What's the game about?"
          />
        </div>

        {createProject.isError && (
          <p className="text-xs text-error">
            {createProject.error instanceof ApiRequestError
              ? createProject.error.message
              : 'Could not create this project.'}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={createProject.isPending || name.trim().length === 0}>
            {createProject.isPending ? 'Creating…' : 'Create project'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </SectionPanel>
  );
}
