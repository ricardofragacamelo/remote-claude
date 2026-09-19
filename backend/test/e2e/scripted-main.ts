import 'reflect-metadata';

import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { ALL_INTERFACES, configureApp, listen, loadDotEnv } from '../../src/bootstrap';
import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import { scriptedSdk } from '../fakes/agent-sdk/scripted-query';

/**
 * The product, with a scripted Agent SDK behind it.
 *
 * **The same application**: the same module graph, the same gateway, the same four layers, the
 * same PostgreSQL. One provider is replaced — the function that would spawn the Claude CLI — and
 * what replaces it replays a run captured from the real SDK (`pnpm fixtures:record`).
 *
 * It exists because the end-to-end suite has to be deterministic and Claude is not, and because
 * every run of it would otherwise cost money. The suite that talks to the real thing is
 * `e2e/smoke-live/`, which runs against `main.ts` and is deliberately not a gate.
 *
 * It lives in `test/` rather than behind a flag in `src/`, and that is the whole point: a switch
 * in the product that replaces the Agent SDK is a switch that eventually ships switched on.
 */
async function bootstrap(): Promise<void> {
  loadDotEnv();

  const fixture = process.env['RC_E2E_FIXTURE'] ?? 'tool-turn';
  const scripted = scriptedSdk({ fixture });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(QUERY_FACTORY)
    .useValue(scripted.createQuery)
    .compile();

  const app = moduleRef.createNestApplication({ bufferLogs: true });

  await listen(app, configureApp(app), ALL_INTERFACES);
}

await bootstrap();
