import { type Clock } from '../shared/clock';
import { type IdGenerator } from '../shared/id';
import { ValidationError } from '../shared/errors';
import { optionalText, requireText } from '../shared/validation';

export const PROJECT_STATUSES = ['active', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const MAX_PROJECT_NAME_LENGTH = 200;
export const MAX_PROJECT_DESCRIPTION_LENGTH = 2_000;

/** A workspace. Every entity, asset and generation belongs to exactly one. */
export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
}

export interface ProjectFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createProject(input: CreateProjectInput, deps: ProjectFactoryDeps): Project {
  const now = deps.clock.now();

  return {
    id: deps.ids.next(),
    name: requireText('name', input.name, MAX_PROJECT_NAME_LENGTH),
    description: optionalText('description', input.description, MAX_PROJECT_DESCRIPTION_LENGTH),
    status: 'active',
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

/** Returns a new project; the input is never mutated. */
export function applyProjectUpdate(
  project: Project,
  patch: UpdateProjectInput,
  deps: { clock: Clock },
): Project {
  const next: Project = { ...project };

  if (patch.name !== undefined) {
    next.name = requireText('name', patch.name, MAX_PROJECT_NAME_LENGTH);
  }
  if (patch.description !== undefined) {
    next.description = optionalText(
      'description',
      patch.description,
      MAX_PROJECT_DESCRIPTION_LENGTH,
    );
  }

  next.updatedAt = deps.clock.now();
  return next;
}

export function archiveProject(project: Project, deps: { clock: Clock }): Project {
  if (project.status === 'archived') {
    throw new ValidationError('Project is already archived', { projectId: project.id });
  }

  const now = deps.clock.now();
  return { ...project, status: 'archived', archivedAt: now, updatedAt: now };
}

export function restoreProject(project: Project, deps: { clock: Clock }): Project {
  if (project.status === 'active') {
    throw new ValidationError('Project is not archived', { projectId: project.id });
  }

  return { ...project, status: 'active', archivedAt: null, updatedAt: deps.clock.now() };
}
