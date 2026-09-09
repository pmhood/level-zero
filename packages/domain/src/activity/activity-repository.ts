import { type Activity, type ActivityType } from './activity';

export interface ActivityListFilter {
  types?: readonly ActivityType[];
  /** Scopes the feed to activity about one subject, for a contextual workspace view. */
  subjectId?: string;
  limit?: number;
  offset?: number;
}

export interface ActivityPage {
  items: Activity[];
  total: number;
}

/**
 * Storage port for the project activity feed.
 *
 * There is deliberately no update or delete: an activity entry is immutable
 * once written, the same as an entity version.
 */
export interface ActivityRepository {
  insert(activity: Activity): Promise<Activity>;
  listByProject(projectId: string, filter: ActivityListFilter): Promise<ActivityPage>;
}
