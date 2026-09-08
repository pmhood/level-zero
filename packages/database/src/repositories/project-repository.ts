import {
  NotFoundError,
  type Project,
  type ProjectListFilter,
  type ProjectPage,
  type ProjectRepository,
} from '@level-zero/domain';
import { and, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import { projects } from '../schema/projects';
import { escapeLikePattern, toProject, toProjectRow } from './mappers';

/** Postgres adapter for the domain's `ProjectRepository` port. */
export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private readonly db: Database) {}

  async insert(project: Project): Promise<Project> {
    const [row] = await this.db.insert(projects).values(toProjectRow(project)).returning();
    if (!row) throw new Error('Insert returned no project row');
    return toProject(row);
  }

  async findById(projectId: string): Promise<Project | null> {
    const [row] = await this.db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    return row ? toProject(row) : null;
  }

  async list(filter: ProjectListFilter): Promise<ProjectPage> {
    const where = buildProjectWhere(filter);

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(projects)
        .where(where)
        .orderBy(desc(projects.createdAt), desc(projects.id))
        .limit(filter.limit ?? 50)
        .offset(filter.offset ?? 0),
      this.db.select({ value: count() }).from(projects).where(where),
    ]);

    return { items: rows.map(toProject), total: totals?.value ?? 0 };
  }

  async save(project: Project): Promise<Project> {
    const [row] = await this.db
      .update(projects)
      .set(toProjectRow(project))
      .where(eq(projects.id, project.id))
      .returning();

    if (!row) throw new NotFoundError('Project', project.id);
    return toProject(row);
  }
}

function buildProjectWhere(filter: ProjectListFilter): SQL | undefined {
  const conditions: SQL[] = [];

  if (filter.statuses?.length) {
    conditions.push(inArray(projects.status, [...filter.statuses]));
  }

  const search = filter.search?.trim();
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`;
    const matches = or(ilike(projects.name, pattern), ilike(projects.description, pattern));
    if (matches) conditions.push(matches);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}
