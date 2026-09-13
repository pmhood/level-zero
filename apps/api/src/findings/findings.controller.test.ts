import {
  ConsistencyScanService,
  FindingService,
  JobService,
  createFinding,
  createProject,
  fixedClock,
  sequentialIdGenerator,
  type CheckFinding,
  type Finding,
  type Project,
} from '@level-zero/domain';
import {
  InMemoryEntityRepository,
  InMemoryFindingRepository,
  InMemoryJobEvents,
  InMemoryJobQueue,
  InMemoryJobRepository,
  InMemoryProjectRepository,
  InMemoryPrototypeVersionRepository,
} from '@level-zero/domain/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DomainExceptionFilter } from '../common/domain-exception.filter';
import { FindingsController } from './findings.controller';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const deps = { clock, ids: sequentialIdGenerator('id') };

let app: INestApplication;
let findingRepo: InMemoryFindingRepository;
let projectRepo: InMemoryProjectRepository;
let jobs: JobService;
let scans: ConsistencyScanService;
let project: Project;
let otherProject: Project;

const evidence = [
  { entityId: 'entity-a', where: 'The Diver', states: 'also named the diver' },
  { entityId: 'entity-b', where: 'the diver', states: 'also named The Diver' },
];

function input(
  overrides: Partial<CheckFinding & { projectId: string; checkId: string }> = {},
): CheckFinding & { projectId: string; checkId: string } {
  return {
    projectId: project.id,
    checkId: 'duplicate-name',
    fingerprint: `duplicate-name::${overrides.projectId ?? project.id}`,
    severity: 'conflict',
    summary: 'The Diver and the diver look like the same character.',
    evidence,
    ...overrides,
  };
}

async function seedFinding(
  overrides: Partial<CheckFinding & { projectId: string; checkId: string }> = {},
): Promise<Finding> {
  return findingRepo.upsert(createFinding({ ...input(overrides), origin: 'deterministic' }, deps));
}

beforeEach(async () => {
  findingRepo = new InMemoryFindingRepository();
  projectRepo = new InMemoryProjectRepository();
  jobs = new JobService(
    new InMemoryJobRepository(),
    projectRepo,
    new InMemoryJobQueue(),
    new InMemoryJobEvents(),
    deps,
  );
  scans = new ConsistencyScanService(
    new InMemoryEntityRepository(),
    new InMemoryPrototypeVersionRepository(),
    findingRepo,
    jobs,
    deps,
  );
  const findings = new FindingService(findingRepo, deps);

  const moduleRef = await Test.createTestingModule({
    controllers: [FindingsController],
    providers: [
      { provide: FindingService, useValue: findings },
      { provide: ConsistencyScanService, useValue: scans },
      { provide: APP_FILTER, useClass: DomainExceptionFilter },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  project = await projectRepo.insert(createProject({ name: 'Deep Fathom' }, deps));
  otherProject = await projectRepo.insert(createProject({ name: 'Sky Wreck' }, deps));
});

afterEach(async () => {
  await app.close();
});

const http = () => request(app.getHttpServer());
const findingsUrl = (projectId = project.id) => `/api/projects/${projectId}/findings`;

describe('GET /projects/:projectId/findings', () => {
  it('lists the project’s findings, newest-seen first', async () => {
    await seedFinding();

    const response = await http().get(findingsUrl()).expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0]).toMatchObject({
      checkId: 'duplicate-name',
      origin: 'deterministic',
      status: 'open',
    });
  });

  it('filters by status', async () => {
    await seedFinding();

    const response = await http().get(findingsUrl()).query({ status: 'dismissed' }).expect(200);

    expect(response.body.items).toHaveLength(0);
  });

  it('never reaches another project’s findings', async () => {
    await seedFinding();
    await seedFinding({
      projectId: otherProject.id,
      fingerprint: `duplicate-name::${otherProject.id}`,
    });

    const response = await http().get(findingsUrl(otherProject.id)).expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0].projectId).toBe(otherProject.id);
  });
});

describe('GET /projects/:projectId/findings/:findingId', () => {
  it('reads one finding', async () => {
    const finding = await seedFinding();

    const response = await http().get(`${findingsUrl()}/${finding.id}`).expect(200);

    expect(response.body.id).toBe(finding.id);
  });

  it('reports an unknown finding as not found', async () => {
    await http().get(`${findingsUrl()}/11111111-1111-4111-8111-111111111111`).expect(404);
  });
});

describe('POST /projects/:projectId/findings/scan', () => {
  it('queues a scan and answers with the job running it', async () => {
    const response = await http().post(`${findingsUrl()}/scan`).expect(201);

    expect(response.body).toMatchObject({
      kind: 'consistency_scan',
      targetId: project.id,
      status: 'queued',
    });
  });

  it('returns the scan already running rather than queueing a second one', async () => {
    const first = await http().post(`${findingsUrl()}/scan`).expect(201);
    const second = await http().post(`${findingsUrl()}/scan`).expect(201);

    expect(second.body.id).toBe(first.body.id);
  });
});

describe('POST /projects/:projectId/findings/:findingId/dismiss', () => {
  it('marks the finding dismissed without deleting it', async () => {
    const finding = await seedFinding();

    const response = await http()
      .post(`${findingsUrl()}/${finding.id}/dismiss`)
      .send({ dismissedBy: 'pete', reason: 'known trade-off' })
      .expect(201);

    expect(response.body).toMatchObject({
      status: 'dismissed',
      dismissedBy: 'pete',
      dismissedReason: 'known trade-off',
    });

    const stillThere = await http().get(`${findingsUrl()}/${finding.id}`).expect(200);
    expect(stillThere.body.status).toBe('dismissed');
  });

  it('requires an identified dismisser', async () => {
    const finding = await seedFinding();

    await http().post(`${findingsUrl()}/${finding.id}/dismiss`).send({}).expect(400);
  });
});

describe('POST /projects/:projectId/findings/:findingId/reopen', () => {
  it('undoes a dismissal in one call', async () => {
    const finding = await seedFinding();
    await http()
      .post(`${findingsUrl()}/${finding.id}/dismiss`)
      .send({ dismissedBy: 'pete' })
      .expect(201);

    const response = await http().post(`${findingsUrl()}/${finding.id}/reopen`).expect(201);

    expect(response.body).toMatchObject({
      status: 'open',
      dismissedAt: null,
      dismissedBy: null,
    });
  });
});
