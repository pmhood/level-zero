import { describe, expect, it } from 'vitest';

import { apiEnvSchema, webEnvSchema, workerEnvSchema } from './schemas';
import { EnvValidationError, parseEnv } from './parse';

const validSource = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://level_zero:level_zero@localhost:5432/level_zero',
  REDIS_URL: 'redis://localhost:6379',
};

describe('apiEnvSchema', () => {
  it('applies defaults for optional values', () => {
    const env = parseEnv(apiEnvSchema, 'api', validSource);

    expect(env.API_PORT).toBe(3001);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.API_CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('coerces ports from strings', () => {
    const env = parseEnv(apiEnvSchema, 'api', { ...validSource, API_PORT: '4001' });

    expect(env.API_PORT).toBe(4001);
  });

  it('splits and trims the CORS origin list', () => {
    const env = parseEnv(apiEnvSchema, 'api', {
      ...validSource,
      API_CORS_ORIGINS: 'http://localhost:3000, https://workbench.example ,',
    });

    expect(env.API_CORS_ORIGINS).toEqual(['http://localhost:3000', 'https://workbench.example']);
  });

  it('reports every problem at once instead of only the first', () => {
    expect(() => parseEnv(apiEnvSchema, 'api', { NODE_ENV: 'test' })).toThrow(EnvValidationError);

    try {
      parseEnv(apiEnvSchema, 'api', { NODE_ENV: 'test' });
      expect.unreachable('parseEnv should have thrown');
    } catch (error) {
      const issues = (error as EnvValidationError).issues.join('\n');
      expect(issues).toContain('DATABASE_URL');
      expect(issues).toContain('REDIS_URL');
    }
  });

  it('rejects a database url that is not postgres', () => {
    expect(() =>
      parseEnv(apiEnvSchema, 'api', { ...validSource, DATABASE_URL: 'mysql://localhost/db' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects an out-of-range port', () => {
    expect(() => parseEnv(apiEnvSchema, 'api', { ...validSource, API_PORT: '99999' })).toThrow(
      /API_PORT/,
    );
  });
});

describe('workerEnvSchema', () => {
  it('defaults the worker health port', () => {
    expect(parseEnv(workerEnvSchema, 'worker', validSource).WORKER_PORT).toBe(3002);
  });
});

describe('webEnvSchema', () => {
  it('only exposes public variables', () => {
    const env = parseEnv(webEnvSchema, 'web', {
      NODE_ENV: 'test',
      NEXT_PUBLIC_API_URL: 'http://localhost:3001',
      DATABASE_URL: 'postgresql://should-not-leak',
    });

    expect(env).toEqual({ NODE_ENV: 'test', NEXT_PUBLIC_API_URL: 'http://localhost:3001' });
  });

  it('rejects a malformed public api url', () => {
    expect(() =>
      parseEnv(webEnvSchema, 'web', { NODE_ENV: 'test', NEXT_PUBLIC_API_URL: 'not-a-url' }),
    ).toThrow(/NEXT_PUBLIC_API_URL/);
  });
});
