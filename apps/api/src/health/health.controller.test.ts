import { type DependencyCheckResult } from '@level-zero/database';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HealthController } from './health.controller';
import { HEALTH_PROBES, HealthService } from './health.service';
import { type HealthProbe } from './health.types';

const up: DependencyCheckResult = { status: 'up', latencyMs: 1, details: { appliedMigrations: 1 } };
const down: DependencyCheckResult = { status: 'down', latencyMs: 1, error: 'ECONNREFUSED' };

async function createApp(probes: HealthProbe[]): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [HealthService, { provide: HEALTH_PROBES, useValue: probes }],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

describe('health endpoints (healthy)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp([
      { name: 'postgres', check: async () => up },
      { name: 'redis', check: async () => up },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health/live returns 200', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/live').expect(200);

    expect(response.body).toMatchObject({ status: 'ok', service: 'level-zero-api' });
  });

  it('GET /api/health/ready returns 200 with per-dependency detail', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/ready').expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.checks.postgres.details.appliedMigrations).toBe(1);
  });

  it('GET /api/health returns the summary', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });
});

describe('health endpoints (degraded)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp([
      { name: 'postgres', check: async () => up },
      { name: 'redis', check: async () => down },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health/ready returns 503 so orchestrators stop routing traffic', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/ready').expect(503);

    expect(response.body.status).toBe('error');
    expect(response.body.checks.redis.error).toBe('ECONNREFUSED');
  });

  it('GET /api/health still returns 200 for dashboards', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(response.body.status).toBe('error');
  });
});
