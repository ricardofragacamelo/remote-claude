import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { json } from 'express';
import type { NextFunction, Request, Response } from 'express';

import { AppModule } from '../../src/app.module';
import { ALL_INTERFACES, configureApp, listen, loadDotEnv } from '../../src/bootstrap';
import { PUSH_SENDER } from '@application/notification';
import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import { TRANSCRIPT_SDK } from '@adapter/outbound/claude/transcript-sdk';
import { HttpPushSender } from '@adapter/outbound/push/http-push.adapter';
import { PushAccessTokenCache } from '@adapter/outbound/push/push-access-token.cache';
import { PUSH_ACCESS_TOKENS, PUSH_TEXT } from '@adapter/outbound/push/push.tokens';
import { APP_CONFIG } from '@infra/config/environment';
import type { AppConfig } from '@infra/config/environment';
import type { PushTranslator } from '@shared/i18n/push-translator';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { scriptedSdk } from '../fakes/agent-sdk/scripted-query';
import { capturedTranscript, ScriptedTranscripts } from '../fakes/agent-sdk/scripted-transcripts';
import { FailFirstPushSender } from '../fakes/fail-first-push';

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

  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(QUERY_FACTORY)
    .useValue(scripted.createQuery)
    .overrideProvider(TRANSCRIPT_SDK)
    .useValue(transcripts);

  // The real provider, failing its first announcement — only in the real-push run, which sets
  // this (plan 05, S-53). Every other run talks to a provider under `.invalid` anyway.
  if (process.env['RC_E2E_PUSH_FAIL_FIRST'] === '1') {
    builder = builder.overrideProvider(PUSH_SENDER).useFactory({
      inject: [APP_CONFIG, PUSH_ACCESS_TOKENS, PUSH_TEXT, LOGGER],
      factory: (
        config: AppConfig,
        tokens: PushAccessTokenCache,
        text: PushTranslator,
        logger: Logger,
      ) => new FailFirstPushSender(new HttpPushSender(config, tokens, text, logger)),
    });
  }

  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication({ bufferLogs: true });
  const port = configureApp(app);
  app.use(ELSEWHERE_PATH, plantsElsewhere(transcripts));

  await listen(app, port, ALL_INTERFACES);
}

/** Where the suite plants a conversation begun elsewhere — on this entry point only. */
const ELSEWHERE_PATH = '/e2e/conversations-elsewhere';

/** What the suite asks for: the conversation's id, the folder it runs in, and what it said. */
interface PlantedConversation {
  readonly conversationId: string;
  readonly cwd: string;
  readonly fixture: string;
  readonly title: string;
}

/** How many conversations were planted, so no two of them share a message id. */
let planted = 0;

/**
 * The one door of the suite into the store of conversations: a conversation **begun elsewhere** —
 * the editor of the person, writing it at this moment — which no session of this backend opened
 * (plan 08, F6).
 *
 * Everything else the suite reads back the product wrote during the run; this one cannot be, since
 * what makes it external is that the product never opened it. So it is planted with the store's own
 * function, `add`, out of the messages of a captured run — never a transcript somebody typed — and
 * written now, which is what "active elsewhere" means. It is mounted here, beside the providers it
 * replaces, and the product's entry point has no such route.
 */
function plantsElsewhere(
  transcripts: ScriptedTranscripts,
): (request: Request, response: Response, next: NextFunction) => void {
  const body = json();

  return (request, response, next) => {
    if (request.method !== 'POST') {
      next();
      return;
    }

    body(request, response, () => {
      const seed = request.body as PlantedConversation;
      planted += 1;
      transcripts.add({
        sessionId: seed.conversationId,
        directory: seed.cwd,
        cwd: seed.cwd,
        summary: seed.title,
        lastModified: Date.now(),
        messages: capturedTranscript(seed.fixture, planted),
      });
      response.status(201).end();
    });
  };
}

await bootstrap();
