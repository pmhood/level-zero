import {
  NotFoundError,
  type Job,
  type JobListFilter,
  type JobPage,
  type JobRepository,
} from '@level-zero/domain';
import { and, count, desc, eq, inArray, type SQL } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import { jobs } from '../schema/jobs';
import { toJob, toJobRow } from './mappers';

/**
 * Postgres adapter for the domain's `JobRepository` port.
 *
 * Every statement carries `project_id`, including the ones that look up a row
 * by its primary key, so a mismatched project can never read or write another
 * project's job.
 */
export class DrizzleJobRepository implements JobRepository {
  constructor(private readonly db: Database) {}

  async insert(job: Job): Promise<Job> {
    const [row] = await this.db.insert(jobs).values(toJobRow(job)).returning();
    if (!row) throw new Error('Insert returned no job row');
    return toJob(row);
  }

  async findById(projectId: string, jobId: string): Promise<Job | null> {
    const [row] = await this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.projectId, projectId)))
      .limit(1);

    return row ? toJob(row) : null;
  }

  async listByProject(projectId: string, filter: JobListFilter): Promise<JobPage> {
    const where = buildJobWhere(projectId, filter);

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(jobs)
        .where(where)
        .orderBy(desc(jobs.createdAt), desc(jobs.id))
        .limit(filter.limit ?? 50)
        .offset(filter.offset ?? 0),
      this.db.select({ value: count() }).from(jobs).where(where),
    ]);

    return { items: rows.map(toJob), total: totals?.value ?? 0 };
  }

  async save(job: Job): Promise<Job> {
    const [row] = await this.db
      .update(jobs)
      .set(toJobRow(job))
      .where(and(eq(jobs.id, job.id), eq(jobs.projectId, job.projectId)))
      .returning();

    if (!row) throw new NotFoundError('Job', job.id);
    return toJob(row);
  }
}

function buildJobWhere(projectId: string, filter: JobListFilter): SQL {
  const conditions: SQL[] = [eq(jobs.projectId, projectId)];

  if (filter.statuses?.length) {
    conditions.push(inArray(jobs.status, [...filter.statuses]));
  }

  if (filter.kind) {
    conditions.push(eq(jobs.kind, filter.kind));
  }

  if (filter.targetId) {
    conditions.push(eq(jobs.targetId, filter.targetId));
  }

  return and(...conditions) as SQL;
}
