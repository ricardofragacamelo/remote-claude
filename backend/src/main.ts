import 'reflect-metadata';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from '@infra/config/environment';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { NestLoggerBridge } from '@shared/logging/nest-logger';

/**
 * Loads the repository `.env` when the process was not started by `pnpm dev`.
 *
 * The startup script already exports it; running `pnpm --filter backend dev` on its own does not,
 * and a backend that refuses to start because nobody sourced a file is friction with no upside.
 */
function loadDotEnv(): void {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');

  if (fs.existsSync(file)) {
    process.loadEnvFile(file);
  }
}

async function bootstrap(): Promise<void> {
  loadDotEnv();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<AppConfig>(APP_CONFIG);
  const logger = app.get<Logger>(LOGGER);

  app.useLogger(new NestLoggerBridge(logger));
  app.useWebSocketAdapter(new WsAdapter(app));
  app.use(cookieParser());
  app.enableCors({ origin: config.webOrigin, credentials: true });
  app.enableShutdownHooks();

  await app.listen(config.port);

  logger.info(
    { op: 'server.start', layer: 'infrastructure', port: config.port },
    'backend listening',
  );
}

await bootstrap();
