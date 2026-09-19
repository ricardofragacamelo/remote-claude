import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';
import { waitFor } from '../../../../support/app/wait-for';

/**
 * The deadline this suite runs with, fixed rather than inherited.
 *
 * Every permission scenario fixes the values it uses or stops being deterministic
 * ([D-09](../../../../../../docs/plans/01-live-session/decisions.md)). Long enough for a second
 * socket to connect and attach before it fires; short enough that the case where nobody answers
 * is a test and not a coffee break.
 */
const TIMEOUT_MS = 1_500;
const EXTENSION_MS = 3_000;

/**
 * The round trip the whole protocol exists for: the **server** asks, and waits.
 *
 * Over a real socket against the real gateway, with the Agent SDK replaying a recorded run. What
 * is being proved is not that a message can be sent — it is that the agent loop is genuinely
 * blocked until somebody answers, that silence refuses, and that a second client cannot make the
 * same tool run twice.
 */
describe('the permission round trip', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let connection: DatabaseConnection;
  let root: string;
  const open: TestSocket[] = [];
  const started: { socket: TestSocket; sessionId: string }[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    connection = openDatabase(database.url);

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    const scripted = scriptedSdk({ fixture: 'tool-turn' });

    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
      {
        RC_PERMISSION_TIMEOUT_MS: String(TIMEOUT_MS),
        RC_PERMISSION_EXTENSION_MS: String(EXTENSION_MS),
        RC_PERMISSION_MAX_EXTENSIONS: '1',
      },
    );
  });

  afterEach(async () => {
    // Every test opens a session and the installation allows ten at once. Without this the
    // eleventh test would be refused by the limit doing exactly what it is for, and the failure
    // would look like a permission bug.
    for (const { socket, sessionId } of started.splice(0)) {
      if (!socket.isOpen) {
        continue;
      }

      socket.send(commandFrame('session.close', { sessionId }));
      await until(socket, 'session.closed').catch(() => undefined);
    }
  });

  afterAll(async () => {
    for (const socket of open) {
      socket.close();
    }
    await harness.close();
    await connection.pool.end();
    await identity.stop();
    await database.stop();
  });

  async function connect(): Promise<TestSocket> {
    const socket = await TestSocket.open(harness.url);
    open.push(socket);

    socket.send(
      commandFrame('connection.authenticate', {
        token: await identity.accessToken({ subject: SUBJECT }),
        locale: 'en',
        client: { kind: 'web', version: '0.0.0' },
      }),
    );
    await socket.next();

    return socket;
  }

  async function until(socket: TestSocket, type: string, limit = 400): Promise<Envelope> {
    const seen: string[] = [];

    for (let taken = 0; taken < limit; taken += 1) {
      const frame = await socket.next();
      seen.push(
        `${frame.type}${frame.kind === 'error' ? `(${String(frame.payload?.['code'])})` : ''}`,
      );

      if (frame.type === type) {
        return frame;
      }
    }

    throw new Error(`no ${type} in: ${seen.join(', ')}`);
  }

  /** Opens a session and prompts it, stopping at the question the recorded run always asks. */
  async function askedAbout(socket: TestSocket): Promise<{ sessionId: string; request: Envelope }> {
    socket.send(commandFrame('session.start', { workspacePath: root }));
    await socket.next();

    const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);
    started.push({ socket, sessionId });

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));

    return { sessionId, request: await until(socket, 'permission.requested') };
  }

  /**
   * Everything already queued for a socket, and nothing more.
   *
   * A command of its own is the barrier: the gateway answers in order, so everything produced
   * before it is delivered before its ack. It lets a test assert that something did **not**
   * arrive without waiting out a timeout for it.
   */
  async function deliveredSoFar(socket: TestSocket): Promise<string[]> {
    socket.send(commandFrame('session.setLocale', { locale: 'en' }));

    const seen: string[] = [];
    for (let taken = 0; taken < 100; taken += 1) {
      const frame = await socket.next();

      if (frame.kind === 'ack' && frame.payload?.['command'] === 'session.setLocale') {
        return seen;
      }

      seen.push(frame.type);
    }

    throw new Error(`the barrier never came back; saw ${seen.join(', ')}`);
  }

  /** The row the history kept for a request. */
  async function history(requestId: string) {
    const rows = await connection.db.execute<{
      status: string;
      decision: string | null;
      resolved_by: string | null;
      auto: boolean | null;
      extensions_used: number;
    }>(
      sql`SELECT "status", "decision", "resolved_by", "auto", "extensions_used"
          FROM "permission_requests" WHERE "id" = ${requestId}`,
    );

    return rows.rows[0] ?? null;
  }

  it('asks as a `request`, with everything a person needs to decide', async () => {
    const { request } = await askedAbout(await connect());

    expect(request.kind).toBe('request');
    expect(request.payload).toMatchObject({
      toolName: 'Write',
      riskHint: 'write',
      defaultToNo: true,
    });
    expect(request.payload?.['requestId']).toBeTypeOf('string');
    // Unnumbered: a question is not part of the history of the conversation, and replaying an
    // answered one would put a dead card back on screen.
    expect(request.seq).toBeUndefined();
  });

  it('records the question before anybody sees it', async () => {
    const { request } = await askedAbout(await connect());

    expect(await history(String(request.payload?.['requestId']))).toMatchObject({
      status: 'pending',
      decision: null,
    });
  });

  it('releases the agent loop when a human says yes — S-50', async () => {
    const socket = await connect();
    const { request } = await askedAbout(socket);

    socket.send(
      commandFrame('permission.resolve', {
        requestId: request.payload?.['requestId'],
        decision: 'allow',
      }),
    );

    const resolved = await until(socket, 'permission.resolved');
    expect(resolved.payload).toMatchObject({ decision: 'allow', auto: false, resolvedBy: SUBJECT });
    // The loop was blocked on that answer; the turn only finishes because it arrived.
    await until(socket, 'turn.completed');
  });

  it('tells everybody watching, including whoever answered — S-64', async () => {
    const answering = await connect();
    const watching = await connect();
    const { sessionId, request } = await askedAbout(answering);

    watching.send(commandFrame('session.attach', { sessionId }));
    await until(watching, 'session.attached');

    answering.send(
      commandFrame('permission.resolve', {
        requestId: request.payload?.['requestId'],
        decision: 'deny',
        reason: 'not now',
      }),
    );

    for (const socket of [answering, watching]) {
      expect((await until(socket, 'permission.resolved')).payload).toMatchObject({
        decision: 'deny',
        resolvedBy: SUBJECT,
      });
    }
  });

  it('lets the first answer win, and shows the loser who won', async () => {
    // Two clients watch one session and both may answer. The second is not an error: it gets an
    // ordinary ack, and the event tells it which decision actually reached the SDK. The e2e that
    // proves the same thing through a browser is S-54, in the last phase of this plan.
    const first = await connect();
    const second = await connect();
    const { sessionId, request } = await askedAbout(first);
    const requestId = String(request.payload?.['requestId']);

    second.send(commandFrame('session.attach', { sessionId }));
    await until(second, 'session.attached');

    first.send(commandFrame('permission.resolve', { requestId, decision: 'allow' }));
    second.send(
      commandFrame('permission.resolve', { requestId, decision: 'deny', reason: 'too late' }),
    );

    expect((await until(second, 'permission.resolved')).payload).toMatchObject({
      requestId,
      decision: 'allow',
      resolvedBy: SUBJECT,
    });
    expect(await history(requestId)).toMatchObject({ decision: 'allow', auto: false });
  });

  it('refuses by itself when nobody answers — S-51, S-63', async () => {
    const socket = await connect();
    const { request } = await askedAbout(socket);
    const requestId = String(request.payload?.['requestId']);

    // Silence never authorises, and ours is the only timeout there is: the CLI was measured
    // holding a permission open for 150 s without giving up.
    const resolved = await until(socket, 'permission.resolved');

    expect(resolved.payload).toMatchObject({ requestId, decision: 'deny', auto: true });
    expect(resolved.payload?.['resolvedBy']).toBeUndefined();
    expect(await history(requestId)).toMatchObject({ status: 'expired', decision: 'deny' });
  });

  it('acks an answer that arrives after the deadline, and changes nothing — S-52', async () => {
    const socket = await connect();
    const { request } = await askedAbout(socket);
    const requestId = String(request.payload?.['requestId']);

    await until(socket, 'permission.resolved');
    socket.send(commandFrame('permission.resolve', { requestId, decision: 'allow' }));

    const ack = await until(socket, 'command.accepted');
    expect(ack.kind).toBe('ack');
    expect(await history(requestId)).toMatchObject({ decision: 'deny', auto: true });
  });

  it('refuses an answer from a connection that is not watching the session — S-57', async () => {
    const owner = await connect();
    const stranger = await connect();
    const { request } = await askedAbout(owner);

    stranger.send(
      commandFrame('permission.resolve', {
        requestId: request.payload?.['requestId'],
        decision: 'allow',
      }),
    );

    const failure = await until(stranger, 'error');
    expect(failure.payload).toMatchObject({
      code: 'PERMISSION_NOT_OWNED',
      httpEquivalent: 403,
    });
  });

  it('refuses a `deny` with no reason, at the schema — S-55', async () => {
    const socket = await connect();
    const { request } = await askedAbout(socket);

    socket.send(
      commandFrame('permission.resolve', {
        requestId: request.payload?.['requestId'],
        decision: 'deny',
      }),
    );

    expect((await until(socket, 'error')).payload).toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('republishes what is still open when a client reattaches — S-59', async () => {
    // The gap is between the client and us; the channel to the CLI never dropped, so the promise
    // `canUseTool` is holding is still pending here. `reinitialize()` is not used and not needed:
    // the register of what is pending is ours (ADR-012).
    const first = await connect();
    const { sessionId, request } = await askedAbout(first);

    const reconnected = await connect();
    reconnected.send(commandFrame('session.attach', { sessionId }));
    await until(reconnected, 'session.attached');

    const republished = await until(reconnected, 'permission.requested');
    expect(republished.payload?.['requestId']).toBe(request.payload?.['requestId']);
  });

  it('republishes nothing once the question has been answered — S-59', async () => {
    const first = await connect();
    const { sessionId, request } = await askedAbout(first);

    first.send(
      commandFrame('permission.resolve', {
        requestId: request.payload?.['requestId'],
        decision: 'allow',
      }),
    );
    await until(first, 'permission.resolved');

    const reconnected = await connect();
    reconnected.send(commandFrame('session.attach', { sessionId }));
    await until(reconnected, 'session.attached');

    // A replayed question would put a card on screen for something already decided. What the
    // registry knows — and the ring buffer does not — is which ones are still open.
    //
    // The barrier is a command of its own: everything the attach produced is already queued ahead
    // of its ack, so reading up to that ack reads exactly what the attach delivered — without
    // waiting on a timeout for something that is supposed not to arrive.
    expect(await deliveredSoFar(reconnected)).not.toContain('permission.requested');
  });

  describe('extending the deadline', () => {
    it('moves it, and says how many are left — S-91', async () => {
      const socket = await connect();
      const { request } = await askedAbout(socket);
      const requestId = String(request.payload?.['requestId']);

      socket.send(commandFrame('permission.extend', { requestId }));

      const extended = await until(socket, 'permission.extended');
      expect(extended.payload).toMatchObject({ requestId, remainingExtensions: 0 });
      expect(new Date(String(extended.payload?.['expiresAt'])).getTime()).toBeGreaterThan(
        new Date(String(request.payload?.['expiresAt'])).getTime(),
      );
    });

    it('refuses past the ceiling, rather than pretending — S-92', async () => {
      const socket = await connect();
      const { request } = await askedAbout(socket);
      const requestId = String(request.payload?.['requestId']);

      socket.send(commandFrame('permission.extend', { requestId }));
      await until(socket, 'permission.extended');

      // The ceiling is one for this suite, so the second ask has nothing left to spend. It is an
      // error and not a silent no-op: a countdown that looks extendable when it is not is worse
      // than one that says so.
      await waitFor(
        'the extension to be spent',
        () => history(requestId),
        (row) => row?.extensions_used === 1,
      );
      socket.send(commandFrame('permission.extend', { requestId }));

      expect((await until(socket, 'error')).payload).toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('refuses to extend something already over — S-93', async () => {
      const socket = await connect();
      const { request } = await askedAbout(socket);
      const requestId = String(request.payload?.['requestId']);

      socket.send(commandFrame('permission.resolve', { requestId, decision: 'allow' }));
      await until(socket, 'permission.resolved');

      socket.send(commandFrame('permission.extend', { requestId }));

      expect((await until(socket, 'error')).payload).toMatchObject({
        code: 'PERMISSION_REQUEST_NOT_FOUND',
      });
    });

    it('costs one extension when two clients press it together — S-94', async () => {
      const first = await connect();
      const second = await connect();
      const { sessionId, request } = await askedAbout(first);
      const requestId = String(request.payload?.['requestId']);

      second.send(commandFrame('session.attach', { sessionId }));
      await until(second, 'session.attached');

      first.send(commandFrame('permission.extend', { requestId }));
      second.send(commandFrame('permission.extend', { requestId }));
      await until(first, 'permission.extended');

      // The command means "give me `increment` more time from now", so two devices asking at the
      // same moment is one act — and the ceiling of one is still intact.
      const row = await waitFor(
        'the extension to be recorded',
        () => history(requestId),
        (value) => value?.extensions_used === 1,
      );
      expect(row).toMatchObject({ extensions_used: 1 });
    });
  });

  it('settles what is still open when the session is closed — S-58', async () => {
    const socket = await connect();
    const { sessionId, request } = await askedAbout(socket);
    const requestId = String(request.payload?.['requestId']);

    socket.send(commandFrame('session.close', { sessionId }));
    await until(socket, 'session.closed');

    // This test closed its own session, so the teardown must not wait for a second terminal event
    // that will never come.
    started.splice(
      started.findIndex((entry) => entry.sessionId === sessionId),
      1,
    );

    // A question whose session has gone is one nobody can answer. Leaving it pending would leave
    // a row claiming a person is still deciding.
    expect(
      await waitFor(
        'the request to be settled',
        () => history(requestId),
        (row) => row?.status !== 'pending',
      ),
    ).toMatchObject({ status: 'expired', decision: 'deny' });
  });
});
