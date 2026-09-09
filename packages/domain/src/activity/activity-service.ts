import { type Clock } from '../shared/clock';
import { type IdGenerator } from '../shared/id';
import { normalizePaging } from '../shared/paging';
import { createActivity, type Activity, type RecordActivityInput } from './activity';
import {
  type ActivityListFilter,
  type ActivityPage,
  type ActivityRepository,
} from './activity-repository';

export interface ActivityServiceDeps {
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Records and reads the project activity feed.
 *
 * There is no endpoint or UI code that writes here directly. The services
 * that already decide whether a change is meaningful — `EntityService`,
 * `EntityVersionService`, `LineageService`, `GenerationService`,
 * `PrototypeService` — record through this as a side effect of the state
 * change itself, the same way `GenerationService.complete` writes lineage
 * through `LineageService` rather than leaving a caller to remember to. That
 * keeps "is this worth telling someone about" a domain decision, made once
 * where the change happens, instead of a call scattered across controllers
 * or feature UI that the next feature can forget to make.
 */
export class ActivityService {
  constructor(
    private readonly activities: ActivityRepository,
    private readonly deps: ActivityServiceDeps,
  ) {}

  async record(input: RecordActivityInput): Promise<Activity> {
    return this.activities.insert(createActivity(input, this.deps));
  }

  /** The project's feed, newest first. */
  async listByProject(projectId: string, filter: ActivityListFilter = {}): Promise<ActivityPage> {
    const { limit, offset } = normalizePaging(filter.limit, filter.offset);
    return this.activities.listByProject(projectId, { ...filter, limit, offset });
  }
}
