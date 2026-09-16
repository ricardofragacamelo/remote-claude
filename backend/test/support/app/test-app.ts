import { Test } from '@nestjs/testing';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { WsAdapter } from '@nestjs/platform-ws';
import cookieParser from 'cookie-parser';
import type { INestApplication } from '@nestjs/common';

import { AppModule } from '../../../src/app.module';
import { AUDIENCE } from '../identity/fake-oidc';
import type { IdentityServer } from '../identity/identity-server';
import { LOGGER } from '@shared/logging/logger';
import { NestLoggerBridge } from '@shared/logging/nest-logger';
import { RecordingLogger } from '../fakes/recording-logger';

/** What a test needs handed back after the app is up. */
export interface TestApp {
  readonly app: INestApplication;
  readonly log: RecordingLogger;

  /** `http://127.0.0.1:<port>`, with the IPv6 form Nest prints normalised away. */
  readonly url: string;

  close(): Promise<void>;
}

/** Everything the backend needs in its environment, pointed at the fixtures of one suite. */
export function testEnvironment(databaseUrl: string, issuer: string): void {
  process.env['NODE_ENV'] = 'test';
  process.env['LOG_LEVEL'] = 'debug';
  // A real port, because the schema refuses anything that is not one; the suite still listens on
  // an ephemeral port, chosen by `listen(0)` below, so two suites never collide.
  process.env['RC_BACKEND_PORT'] = '3000';
  process.env['RC_WEB_PORT'] = '5173';
  process.env['DATABASE_URL'] = databaseUrl;
  process.env['OIDC_ISSUER'] = issuer;
  process.env['OIDC_AUDIENCE'] = AUDIENCE;
  process.env['OIDC_CLIENT_ID_WEB'] = 'remote-claude-web';
  process.env['OIDC_CLIENT_ID_MOBILE'] = 'remote-claude-mobile';
  process.env['OIDC_SCOPES'] = 'openid profile email offline_access';
}

/**
 * The real application, with the real filter, interceptor, middleware and gateway.
 *
 * Only the outside world is a fixture: PostgreSQL is a container and the identity provider is a
 * local server. Nothing inside `src/` is replaced, which is the point of an integration test —
 * a suite that mocks the transport leaves the transport uncovered.
 */
export async function startTestApp(
  databaseUrl: string,
  identity: IdentityServer,
  customise: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<TestApp> {
  testEnvironment(databaseUrl, identity.issuer);

  const log = new RecordingLogger();
  const moduleRef = await customise(
    Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LOGGER)
      .useValue(log.logger),
  ).compile();

  const app = moduleRef.createNestApplication();
  app.useLogger(new NestLoggerBridge(log.logger));
  app.useWebSocketAdapter(new WsAdapter(app));
  app.use(cookieParser());
  app.enableShutdownHooks();

  await app.init();
  await app.listen(0, '127.0.0.1');

  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  return { app, log, url, close: () => app.close() };
}
