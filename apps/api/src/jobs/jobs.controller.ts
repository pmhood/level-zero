import { JobService, type Job, type JobEvents, type JobPage } from '@level-zero/domain';
import { Controller, Get, Inject, Param, Query, Sse, type MessageEvent } from '@nestjs/common';
import { Observable, interval, map, merge } from 'rxjs';

import { JOB_EVENTS } from '../infrastructure/queue.module';
import { ListJobsQueryDto } from './dto/job.dto';

/** Keeps the stream alive through proxies that close an idle connection. */
const HEARTBEAT_MS = 25_000;

/**
 * Background work: what is queued, how far it has got, and what it is doing.
 *
 * A client loading a page reads the listing for the jobs it cares about and
 * then follows `/stream`, so a refresh picks the work up exactly where it left
 * off — the job record, not the browser, holds the progress. Jobs are started
 * by the feature that owns the work (a generation is queued by `POST
 * /generations`) and cancelled through it, so there is one way to start a piece
 * of work and one way to stop it.
 */
@Controller('projects/:projectId/jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobService,
    // Streaming is a relay, not a domain operation: the controller forwards the
    // events the worker publishes rather than asking the service to re-read.
    @Inject(JOB_EVENTS) private readonly events: JobEvents,
  ) {}

  @Get()
  list(@Param('projectId') projectId: string, @Query() query: ListJobsQueryDto): Promise<JobPage> {
    return this.jobs.listByProject(projectId, {
      statuses: query.status,
      kind: query.kind,
      targetId: query.targetId,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /**
   * Every job change in the project, as server-sent events.
   *
   * Declared before `:jobId` so the path is not read as a job id. Named
   * `heartbeat` events keep the connection open and are ignored by a default
   * `EventSource` handler.
   */
  @Sse('stream')
  stream(@Param('projectId') projectId: string): Observable<MessageEvent> {
    const changes = new Observable<MessageEvent>((subscriber) => {
      const pending = this.events.subscribe(projectId, (job: Job) =>
        subscriber.next({ data: job }),
      );
      pending.catch((error: unknown) => subscriber.error(error));

      return () => {
        void pending.then((subscription) => subscription.close()).catch(() => undefined);
      };
    });

    const heartbeat = interval(HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'heartbeat', data: {} })),
    );

    return merge(changes, heartbeat);
  }

  @Get(':jobId')
  get(@Param('projectId') projectId: string, @Param('jobId') jobId: string): Promise<Job> {
    return this.jobs.getById(projectId, jobId);
  }
}
