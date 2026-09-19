import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { ALL_INTERFACES, configureApp, listen, loadDotEnv } from './bootstrap';

async function bootstrap(): Promise<void> {
  loadDotEnv();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  await listen(app, configureApp(app), ALL_INTERFACES);
}

await bootstrap();
