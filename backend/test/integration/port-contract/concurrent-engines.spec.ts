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

/**
 * Every frame a socket receives over [ms] — used to prove a **negative**: that a session's own
 * socket never sees the other session's events. A fixed window rather than a frame count, because
 * the thing being disproved (cross-talk) would show up as an extra frame, not as a missing one.
 */
function collectFor(socket: TestSocket, ms: number): Promise<Envelope[]> {
  const collected: Envelope[] = [];

  const pump = async (): Promise<void> => {
    for (;;) {
      const next = await Promise.race([
        socket.next().then((frame) => ({ frame })),
        new Promise<{ stop: true }>((resolve) => setTimeout(() => resolve({ stop: true }), ms)),
      ]);

      if ('stop' in next) {
        return;
      }

      collected.push(next.frame);
    }
  };

  return pump().then(() => collected);
}

/**
 * S-122 — a Claude session and a test-engine session, open at once in the **same** folder, do not
 * interfere: separate conversations, separate permission gates, no cross-talk between their events.
 *
 * This is the one scenario of the port contract suite that genuinely needs **both** adapters alive
 * together rather than run twice in isolation (`engine-port-contract.spec.ts`), so it is its own
 * file: the harness wires Claude (over the scripted SDK fake) and the test engine side by side, via
 * the same `EngineRegistry` override `withTestEngine()` gives every other suite here.
 */
describe('a Claude session and a test-engine session in the same folder — S-122', () => {
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

    const scripted = scriptedSdk({ fixture: 'tool-turn' });

    harness = await startTestApp(
      database.url,
      identity,
      (builder) =>
        withTestEngine()(builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery)),
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

  async function start(engine: string): Promise<{ socket: TestSocket; sessionId: string }> {
    const socket = await connect();
    socket.send(commandFrame('session.start', { workspacePath: root, engine }));
    const started = await until(socket, 'session.started');
    return { socket, sessionId: String(started.payload?.['sessionId']) };
  }

  it('opens two sessions, one per engine, in the same folder, each with its own conversation', async () => {
    const claude = await start('claude');
    const test = await start('test');

    expect(claude.sessionId).not.toBe(test.sessionId);
  });

  it("runs a prompt on each at once, and neither socket ever sees the other's events", async () => {
    const claude = await start('claude');
    const test = await start('test');

    claude.socket.send(
      commandFrame('session.prompt', { sessionId: claude.sessionId, text: 'do it' }),
    );
    test.socket.send(
      commandFrame('session.prompt', {
        sessionId: test.sessionId,
        text: '[fixture:tool-turn] do it',
      }),
    );

    const [claudeRequested, testRequested] = await Promise.all([
      until(claude.socket, 'permission.requested'),
      until(test.socket, 'permission.requested'),
    ]);

    // Each request is this session's own tool call, under this engine's own origin — never the
    // other's: the gate is shared infrastructure, but a request always names one session.
    expect(claudeRequested.payload).toMatchObject({ origin: { engine: 'claude' } });
    expect(testRequested.payload).toMatchObject({ origin: { engine: 'test' } });
    expect(claudeRequested.payload?.['requestId']).not.toBe(testRequested.payload?.['requestId']);

    claude.socket.send(
      commandFrame('permission.resolve', {
        requestId: claudeRequested.payload?.['requestId'],
        decision: 'allow',
      }),
    );
    test.socket.send(
      commandFrame('permission.resolve', {
        requestId: testRequested.payload?.['requestId'],
        decision: 'allow',
      }),
    );

    await until(claude.socket, 'turn.completed');
    await until(test.socket, 'turn.completed');
  });

  it("a session resolved from one socket never settles the other session's request", async () => {
    const claude = await start('claude');
    const test = await start('test');

    claude.socket.send(
      commandFrame('session.prompt', { sessionId: claude.sessionId, text: 'do it' }),
    );
    test.socket.send(
      commandFrame('session.prompt', {
        sessionId: test.sessionId,
        text: '[fixture:tool-turn] do it',
      }),
    );

    const claudeRequested = await until(claude.socket, 'permission.requested');
    const testRequested = await until(test.socket, 'permission.requested');

    // Answer only Claude's. If the gate confused the two sessions, the test engine's own request
    // would resolve here too — collected below, over a window the auto-deny deadline has not yet
    // reached (`RC_PERMISSION_TIMEOUT_MS`, the suite's default).
    claude.socket.send(
      commandFrame('permission.resolve', {
        requestId: claudeRequested.payload?.['requestId'],
        decision: 'allow',
      }),
    );
    await until(claude.socket, 'turn.completed');

    const meanwhile = await collectFor(test.socket, 150);
    expect(meanwhile.some((frame) => frame.type === 'permission.resolved')).toBe(false);
    expect(testRequested.payload).toMatchObject({ origin: { engine: 'test' } });
  });
});
