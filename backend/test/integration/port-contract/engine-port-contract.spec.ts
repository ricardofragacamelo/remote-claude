import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/engines/claude/query.factory';
import { scriptedSdk } from '../../fakes/agent-sdk/scripted-query';
import { withTestEngine } from '../../fakes/engine/compose';
import { startPostgres } from '../../support/containers/postgres';
import type { DisposablePostgres } from '../../support/containers/postgres';
import { startIdentityServer } from '../../support/identity/identity-server';
import type { IdentityServer } from '../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../support/app/test-app';
import type { TestApp } from '../../support/app/test-app';
import { commandFrame, TestSocket } from '../../support/app/ws-client';

/** The first frame matching [match] (a type, or a predicate), read off [socket]. */
async function until(
  socket: TestSocket,
  match: string | ((frame: Envelope) => boolean),
  limit = 400,
): Promise<Envelope> {
  const found = typeof match === 'string' ? (frame: Envelope) => frame.type === match : match;

  for (let taken = 0; taken < limit; taken += 1) {
    const frame = await socket.next();
    if (found(frame)) {
      return frame;
    }
  }
  throw new Error(`no frame matched${typeof match === 'string' ? ` (${match})` : ''}`);
}

/** One engine the suite runs the same battery against. */
interface EngineUnderTest {
  readonly engine: string;
  /** What an untagged prompt replays, for this engine. */
  readonly defaultTurn: string;

  /**
   * The prompt that asks for a turn which answers in text and then holds, until
   * `session.interrupt` ends it — each engine's own tag for the same shape (`script.ts`'s own
   * comment on `held-turn`, and `session-panel.spec.ts`'s own choice of `text-turn` for the same
   * reason): a turn with a mid-stream permission consultation genuinely has more than one `await`
   * for `session.interrupt` to race against, which is what the queue scenario is about and not what
   * holding is for. Claude's scripted SDK fake understands `[hold]` over whichever fixture is named
   * or defaulted; the test engine has no such tag and names the turn directly.
   */
  readonly holdPrompt: string;
}

const ENGINES: readonly EngineUnderTest[] = [
  { engine: 'claude', defaultTurn: 'tool-turn', holdPrompt: '[fixture:text-turn][hold] hold' },
  { engine: 'test', defaultTurn: 'tool-turn', holdPrompt: '[fixture:held-turn] hold' },
];

/**
 * The port contract suite (plan 28, B-43; S-120): the same battery of universal scenarios, run
 * twice over the real gateway — once against Claude (`AgentSdkClaudeSessionAdapter`, driven by the
 * scripted SDK fake, exactly as today's Claude-only integration suites drive it) and once against
 * the test engine (`TestEngineAdapter`, `backend/test/fakes/engine/`).
 *
 * **Which scenarios are here, and why.** Read against the existing WS suites
 * (`backend/test/integration/adapter/inbound/ws/`), these are the ones that test the **port's**
 * contract rather than Claude's own shape:
 *
 * - a session starts, with the engine's own capabilities and a conversation tagged with its own
 *   engine (`session-lifecycle.gateway.spec.ts`, `session-composer.spec.ts`);
 * - a tool call goes through the permission gate before it runs, and answering it lets the turn
 *   finish (`permission.gateway.spec.ts`'s round trip, minus everything about Claude's own
 *   `canUseTool` suggestions and native rules);
 * - a prompt sent while a turn is running queues, is shown to everybody watching, and runs next —
 *   `promptWhileBusy` (`session-panel.spec.ts`'s queue, minus the fork-by-edit case, which needs
 *   `fork: 'atMessage'`);
 * - `session.interrupt` ends a turn that is stuck, and the session goes on to the next queued
 *   prompt (`session-panel.spec.ts`, `session-rewind.spec.ts`);
 * - a session that no longer exists refuses a prompt the same way for either engine
 *   (`session-stream.spec.ts`).
 *
 * **Left Claude-specific, on purpose** — none of it generalises because it names something only
 * Claude's capabilities or its CLI have, not because it was merely inconvenient to port:
 * `effort`/`thinking` (plan 28, F4 — the test engine declares neither), `/compact` and
 * `session.compact` (`compaction: false`), the task list (`taskList: false`), plan approval
 * (`planApproval: false`), slash commands and `supportedCommands()` (`slashCommands: false`),
 * model switching and context use (`modelSwitch`/`contextUse: false`), MCP
 * (`mcp: false`), cost in USD (`cost: 'none'`), and anything about the CLI subprocess itself — its
 * environment, its version reporting, `claude-environment.gateway.spec.ts`,
 * `credential.gateway.spec.ts`.
 *
 * **`session-resume.spec.ts` stays entirely Claude-only — a design finding, not a scope cut.**
 * Resuming a conversation is decided by `ResumableConversationSource`
 * (`TranscriptModuleConversationSource`), which asks the engine's **transcript store** for the
 * conversation before anything is spawned (`start-session.use-case.ts`'s `continueConversation`) —
 * this is **not** gated by the `resume` capability flag at all; it runs whether or not the engine
 * declares it. The test engine has no transcript store (`history: false` — F7 does not build one),
 * so `TEST_CAPABILITIES.resume` is `false` too: claiming `resume: true` with nothing backing it
 * would make this suite either hang (as it did, against the real SDK's own file reads, the first time
 * this file tried it against Claude with no `TRANSCRIPT_SDK` override either) or fail for a reason
 * that has nothing to do with the port. A real second engine that wants `resume: true` needs to wire
 * a transcript store the same way Claude's `AgentSdkTranscriptAdapter` does — see
 * `docs/architecture/backend/07-testing.md`'s own note on this.
 *
 * S-121 (the test engine is never reachable from a production build) and S-122 (a Claude session
 * and a test-engine session in the same folder do not interfere) are their own files:
 * `test/unit/architecture/dependency-rule.spec.ts` / `test/unit/infrastructure/modules/engines.spec.ts`
 * for S-121, `concurrent-engines.spec.ts` for S-122.
 */
describe.each(ENGINES)(
  'the port contract — engine $engine',
  ({ engine, defaultTurn, holdPrompt }) => {
    let database: DisposablePostgres;
    let identity: IdentityServer;
    let harness: TestApp;
    let root: string;
    let token: string;
    const open: TestSocket[] = [];

    beforeAll(async () => {
      database = await startPostgres();
      identity = await startIdentityServer();
      const allowlist = writeTestAllowlist([SUBJECT]);
      root = allowlist.root;

      const scripted = scriptedSdk({ fixture: defaultTurn });

      harness = await startTestApp(
        database.url,
        identity,
        (builder) =>
          withTestEngine(
            undefined,
            defaultTurn,
          )(builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery)),
        allowlist,
      );
      token = await identity.accessToken({ subject: SUBJECT });
    });

    afterAll(async () => {
      for (const socket of open) {
        socket.close();
      }
      await harness.close();
      await identity.stop();
      await database.stop();
    });

    async function connect(): Promise<TestSocket> {
      const socket = await TestSocket.open(harness.url);
      open.push(socket);
      socket.send(
        commandFrame('connection.authenticate', {
          token,
          locale: 'en',
          client: { kind: 'web', version: '0.0.0' },
        }),
      );
      await socket.next();
      return socket;
    }

    /** Opens a session of [engine], with whatever [extra] the test adds to `session.start`. */
    async function start(
      extra: Readonly<Record<string, unknown>> = {},
    ): Promise<{ socket: TestSocket; sessionId: string; started: Envelope }> {
      const socket = await connect();
      socket.send(commandFrame('session.start', { workspacePath: root, engine, ...extra }));
      const started = await until(socket, 'session.started');
      return { socket, sessionId: String(started.payload?.['sessionId']), started };
    }

    it("a session starts on the engine asked, carrying that engine's own tag — eq", async () => {
      const { started } = await start();

      expect(started.payload).toMatchObject({
        engine,
        conversation: { engine },
      });
      expect((started.payload?.['capabilities'] as Record<string, unknown>)['cost']).toBeDefined();
    });

    it('a tool call goes through the permission gate before it runs, and completes once answered — eq', async () => {
      const { socket, sessionId } = await start();
      socket.send(commandFrame('session.prompt', { sessionId, text: 'do it' }));

      const requested = await until(socket, 'permission.requested');
      expect(requested.payload).toMatchObject({ kind: 'file.write' });

      socket.send(
        commandFrame('permission.resolve', {
          requestId: requested.payload?.['requestId'],
          decision: 'allow',
        }),
      );

      await until(socket, 'permission.resolved');
      await until(socket, 'tool.completed');
      await until(socket, 'turn.completed');
    });

    it('a prompt sent while a turn is stuck queues, and runs once the turn is interrupted — eq, estado', async () => {
      const { socket, sessionId } = await start();
      socket.send(commandFrame('session.prompt', { sessionId, text: holdPrompt }));

      // The one step of the held turn plays before it sticks — `message.completed`, for both engines
      // — moving the derived status to `thinking`, the same marker `session-panel.spec.ts` waits on.
      await until(socket, (frame) => frame.payload?.['status'] === 'thinking');

      socket.send(commandFrame('session.prompt', { sessionId, text: 'and then this one' }));
      const queued = await until(socket, 'prompt.queued');
      expect(queued.payload).toMatchObject({ preview: 'and then this one' });

      socket.send(commandFrame('session.interrupt', { sessionId }));
      // The held turn's own completion, first — `turn.completed` **before** `prompt.dequeued`: the
      // queue only hands the next prompt over once `PromptQueue.turnEnded()` sees this one close.
      await until(socket, 'turn.completed');
      await until(socket, 'prompt.dequeued');
      // …and then the queued one actually runs, to its own completion.
      await until(socket, 'turn.completed');
    });

    it('a session that no longer exists refuses a prompt — eq', async () => {
      const { socket, sessionId } = await start();
      socket.send(commandFrame('session.close', { sessionId }));
      await until(socket, 'session.closed');

      socket.send(commandFrame('session.prompt', { sessionId, text: 'hello' }));
      const error = await until(socket, 'error');
      expect(error.payload).toMatchObject({ code: 'SESSION_NOT_FOUND' });
    });
  },
);
