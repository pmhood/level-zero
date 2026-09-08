import 'reflect-metadata';

import { loadDotEnv, type ApiEnv } from '@level-zero/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { API_ENV } from './config/config.module';

async function bootstrap(): Promise<void> {
  loadDotEnv(__dirname);

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const env = app.get<ApiEnv>(API_ENV);

  app.setGlobalPrefix('api');
  app.enableCors({ origin: env.API_CORS_ORIGINS, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Lets DatabaseLifecycle/RedisLifecycle close their connections on SIGTERM.
  app.enableShutdownHooks();

  await app.listen(env.API_PORT, '0.0.0.0');

  const logger = new Logger('bootstrap');
  logger.log(`API listening on http://localhost:${env.API_PORT}/api (${env.NODE_ENV})`);
}

bootstrap().catch((error: unknown) => {
  console.error('[api] failed to start');
  console.error(error);
  process.exit(1);
});
