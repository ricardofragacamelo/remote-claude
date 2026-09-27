import 'reflect-metadata';

import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { ALL_INTERFACES, configureApp, listen, loadDotEnv } from '../../src/bootstrap';
import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import { TRANSCRIPT_SDK } from '@adapter/outbound/claude/transcript-sdk';
import { scriptedSdk } from '../fakes/agent-sdk/scripted-query';
import { ScriptedTranscripts } from '../fakes/agent-sdk/scripted-transcripts';

/**
 * The product, with a scripted Agent SDK behind it.
 *
 * **The same application**: the same module graph, the same gateway, the same four layers, the
 * same PostgreSQL. Two providers are replaced — the function that would spawn the Claude CLI, and
 * the three that read Claude's store of conversations. The first replays a run captured from the
 * real SDK (`pnpm fixtures:record`); the second is a store that starts empty, so an end-to-end run
 * never reads the history of whoever happens to run it.
 *
 * The two are **one** Claude, as on a real machine: what the replay says is written to that store,
 * the way `persistSession: true` writes it — so a conversation opened by the suite can be listed,
 * read back after a `gap` and continued (plan 04, F5). And the replay writes the files a recording
 * wrote, in the directory the session runs in, because the undo is about the disk and would
 * otherwise have nothing real to put back.
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
  const transcripts = new ScriptedTranscripts();
  const scripted = scriptedSdk({ fixture, transcripts, performWritesIn: 'cwd' });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(QUERY_FACTORY)
    .useValue(scripted.createQuery)
    .overrideProvider(TRANSCRIPT_SDK)
    .useValue(transcripts)
    .compile();

  const app = moduleRef.createNestApplication({ bufferLogs: true });

  await listen(app, configureApp(app), ALL_INTERFACES);
}

await bootstrap();
