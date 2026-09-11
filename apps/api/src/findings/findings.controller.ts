import {
  ConsistencyScanService,
  FindingService,
  type Finding,
  type FindingPage,
  type Job,
} from '@level-zero/domain';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { DismissFindingDto, ListFindingsQueryDto } from './dto/finding.dto';

/**
 * The Consistency surface: what the last project-wide scan found, and the two
 * things a person may do to one of its findings.
 *
 * There is no "resolve" endpoint. §5 of
 * docs/decisions/consistency-findings.md is explicit that resolving a finding
 * means fixing the thing the scan is watching, not an API call — a `resolve`
 * action that left the underlying objects untouched would put this surface
 * back in the business of lying. The only way a finding moves to `resolved`
 * is the next scan not reproducing it.
 */
@Controller('projects/:projectId/findings')
export class FindingsController {
  constructor(
    private readonly findings: FindingService,
    private readonly scans: ConsistencyScanService,
  ) {}

  @Get()
  list(
    @Param('projectId') projectId: string,
    @Query() query: ListFindingsQueryDto,
  ): Promise<FindingPage> {
    return this.findings.listByProject(projectId, {
      statuses: query.status,
      checkId: query.checkId,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /**
   * Queues a project-wide consistency scan and answers with the job running
   * it. A scan already in flight is returned rather than duplicated
   * (`ConsistencyScanService.requestScan`).
   *
   * Declared before `:findingId` even though the segment counts cannot
   * collide, to read the same way `SearchController.reindex` and
   * `JobsController.stream` do next to their own parameterised routes.
   */
  @Post('scan')
  scan(@Param('projectId') projectId: string): Promise<Job> {
    return this.scans.requestScan(projectId);
  }

  @Get(':findingId')
  get(
    @Param('projectId') projectId: string,
    @Param('findingId') findingId: string,
  ): Promise<Finding> {
    return this.findings.getById(projectId, findingId);
  }

  /**
   * Records the finding as a known, accepted state. The row survives —
   * dismissal is a status, never a deletion — and a later scan that
   * reproduces the same fingerprint leaves this alone.
   */
  @Post(':findingId/dismiss')
  dismiss(
    @Param('projectId') projectId: string,
    @Param('findingId') findingId: string,
    @Body() body: DismissFindingDto,
  ): Promise<Finding> {
    return this.findings.dismiss(projectId, findingId, {
      dismissedBy: body.dismissedBy,
      reason: body.reason,
    });
  }

  /** Undoes a dismissal — one click, per §4.4. */
  @Post(':findingId/reopen')
  reopen(
    @Param('projectId') projectId: string,
    @Param('findingId') findingId: string,
  ): Promise<Finding> {
    return this.findings.reopen(projectId, findingId);
  }
}
