import {
  type Activity,
  type ActivityListFilter,
  type ActivityPage,
  type ActivityRepository,
} from '@level-zero/domain';
import { and, count, desc, eq, inArray, type SQL } from 'drizzle-orm';

import { type Database } from '../postgres/client';
import { activities } from '../schema/activities';
import { toActivity, toActivityRow } from './mappers';

/**
 * Postgres adapter for the domain's `ActivityRepository` port.
 *
 * There is no update or delete: an activity entry is immutable once written.
 */
export class DrizzleActivityRepository implements ActivityRepository {
  constructor(private readonly db: Database) {}

  async insert(activity: Activity): Promise<Activity> {
    const [row] = await this.db.insert(activities).values(toActivityRow(activity)).returning();
    if (!row) throw new Error('Insert returned no activity row');
    return toActivity(row);
  }

  async listByProject(projectId: string, filter: ActivityListFilter): Promise<ActivityPage> {
    const where = buildActivityWhere(projectId, filter);

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(activities)
        .where(where)
        .orderBy(desc(activities.createdAt), desc(activities.id))
        .limit(filter.limit ?? 50)
        .offset(filter.offset ?? 0),
      this.db.select({ value: count() }).from(activities).where(where),
    ]);

    return { items: rows.map(toActivity), total: totals?.value ?? 0 };
  }
}

function buildActivityWhere(projectId: string, filter: ActivityListFilter): SQL {
  const conditions: SQL[] = [eq(activities.projectId, projectId)];

  if (filter.types?.length) {
    conditions.push(inArray(activities.type, [...filter.types]));
  }
  if (filter.subjectId) {
    conditions.push(eq(activities.subjectId, filter.subjectId));
  }

  return and(...conditions) as SQL;
}
