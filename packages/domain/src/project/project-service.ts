import { type Clock } from '../shared/clock';
import { NotFoundError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { normalizePaging } from '../shared/paging';
import {
  applyProjectUpdate,
  archiveProject,
  createProject,
  restoreProject,
  type CreateProjectInput,
  type Project,
  type UpdateProjectInput,
} from './project';
import {
  type ProjectListFilter,
  type ProjectPage,
  type ProjectRepository,
} from './project-repository';

export interface ProjectServiceDeps {
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Application service for projects.
 *
 * Transport layers (the HTTP API, the worker) call this; none of them reach
 * for the repository directly, so the rules live in one place.
 */
export class ProjectService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly deps: ProjectServiceDeps,
  ) {}

  async create(input: CreateProjectInput): Promise<Project> {
    return this.projects.insert(createProject(input, this.deps));
  }

  /** Throws `NotFoundError` rather than returning null: callers want the project. */
  async getById(projectId: string): Promise<Project> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    return project;
  }

  async list(filter: ProjectListFilter = {}): Promise<ProjectPage> {
    const { limit, offset } = normalizePaging(filter.limit, filter.offset);
    return this.projects.list({ ...filter, limit, offset });
  }

  async update(projectId: string, patch: UpdateProjectInput): Promise<Project> {
    const project = await this.getById(projectId);
    return this.projects.save(applyProjectUpdate(project, patch, this.deps));
  }

  async archive(projectId: string): Promise<Project> {
    const project = await this.getById(projectId);
    return this.projects.save(archiveProject(project, this.deps));
  }

  async restore(projectId: string): Promise<Project> {
    const project = await this.getById(projectId);
    return this.projects.save(restoreProject(project, this.deps));
  }
}
