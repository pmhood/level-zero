import { type ApiEnv } from '@level-zero/config';
import {
  createJobEvents,
  createJobQueue,
  type JobEventsClient,
  type JobQueueClient,
} from '@level-zero/database';
import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';

import { API_ENV } from '../config/config.module';

export const JOB_QUEUE = Symbol('JOB_QUEUE');
export const JOB_EVENTS = Symbol('JOB_EVENTS');

@Injectable()
export class QueueLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(JOB_QUEUE) private readonly queue: JobQueueClient,
    @Inject(JOB_EVENTS) private readonly events: JobEventsClient,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.queue.close(), this.events.close()]);
  }
}

/**
 * Registers the queue the API enqueues onto and the channel it streams job
 * state changes from.
 *
 * The API never runs a job: it hands work to Redis and watches for what the
 * worker process reports back.
 */
@Global()
@Module({
  providers: [
    {
      provide: JOB_QUEUE,
      inject: [API_ENV],
      useFactory: (env: ApiEnv): JobQueueClient => createJobQueue({ connectionUrl: env.REDIS_URL }),
    },
    {
      provide: JOB_EVENTS,
      inject: [API_ENV],
      useFactory: (env: ApiEnv): JobEventsClient =>
        createJobEvents({ connectionUrl: env.REDIS_URL }),
    },
    QueueLifecycle,
  ],
  exports: [JOB_QUEUE, JOB_EVENTS],
})
export class QueueModule {}
