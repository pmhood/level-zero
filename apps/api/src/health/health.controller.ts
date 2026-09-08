import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { type Response } from 'express';

import { HealthService } from './health.service';
import { type LivenessReport, type ReadinessReport } from './health.types';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Summary endpoint: same payload as readiness, always HTTP 200. */
  @Get()
  summary(): Promise<ReadinessReport> {
    return this.health.readiness();
  }

  /** Liveness: the process is up. Used by restart policies. */
  @Get('live')
  live(): LivenessReport {
    return this.health.liveness();
  }

  /** Readiness: dependencies are reachable. 503 while anything is down. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response): Promise<ReadinessReport> {
    const report = await this.health.readiness();
    response.status(report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
