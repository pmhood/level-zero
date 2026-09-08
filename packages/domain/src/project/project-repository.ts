import { type Project, type ProjectStatus } from './project';

export interface ProjectListFilter {
  statuses?: readonly ProjectStatus[];
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ProjectPage {
  items: Project[];
  /** Total matching rows, ignoring `limit`/`offset`. */
  total: number;
}

/**
 * Storage port for projects. `packages/database` provides the Postgres
 * adapter; tests use the in-memory one from `@level-zero/domain/testing`.
 */
export interface ProjectRepository {
  insert(project: Project): Promise<Project>;
  findById(projectId: string): Promise<Project | null>;
  list(filter: ProjectListFilter): Promise<ProjectPage>;
  save(project: Project): Promise<Project>;
}
