import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptRecord } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/**
 * A live session, end to end over a real socket.
 *
 * The only thing replaced is the Agent SDK itself, and what replaces it replays a stream captured
 * from a real run — the gateway, the container, the state machine, the hub and the ring buffer are
 * all the production ones. A suite that stubbed the transport would leave the transport untested,
 * and the transport is where `seq` and replay live.
 */
describe('a live session over the gateway', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let record: ScriptRecord;
  let root: string;
  const open: TestSocket[] = [];

  /** Sessions this suite opened, and the socket that may close each — only the owner may. */
  const started: { socket: TestSocket; sessionId: string }[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    const scripted = scriptedSdk({ fixture: 'tool-turn' });
    record = scripted.record;

    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
    );
  });

  /**
   * Ends every session the test opened.
   *
   * Not housekeeping: the installation allows ten at once, and a suite that opened one per test
   * and closed none would fail its eleventh test with `SESSION_LIMIT_REACHED` — the limit doing
   * exactly its job, for a reason that looks nothing like its cause.
   */
  afterEach(async () => {
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
    await identity.stop();
    await database.stop();
  });

  async function connect(subject = SUBJECT): Promise<TestSocket> {
    const socket = await TestSocket.open(harness.url);
    open.push(socket);

    socket.send(
      commandFrame('connection.authenticate', {
        token: await identity.accessToken({ subject }),
        locale: 'en',
        client: { kind: 'web', version: '0.0.0' },
      }),
    );
    await socket.next();

    return socket;
  }

  /** Frames until one of `type` arrives, or a failure naming what did. */
  async function until(socket: TestSocket, type: string, limit = 400): Promise<Envelope> {
    const seen: string[] = [];

    for (let taken = 0; taken < limit; taken += 1) {
      const frame = await socket.next();
      seen.push(frame.type);

      if (frame.type === type) {
        return frame;
      }
    }

    throw new Error(`no ${type} in ${seen.length} frames: ${seen.join(', ')}`);
  }

  /** Opens a session, remembers it for teardown, and answers its id. */
  async function start(socket: TestSocket, workspacePath = root): Promise<string> {
    socket.send(commandFrame('session.start', { workspacePath }));

    await socket.next();
    const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);
    started.push({ socket, sessionId });

    return sessionId;
  }

  it('opens a session on an allowed workspace and announces it — S-21', async () => {
    const socket = await connect();
    socket.send(commandFrame('session.start', { workspacePath: root }));

    const ack = await socket.next();
    expect(ack).toMatchObject({ kind: 'ack', type: 'command.accepted' });

    const started = await until(socket, 'session.started');
    expect(started.payload).toMatchObject({ workspacePath: root, permissionMode: 'default' });
    expect(started.seq).toBe(1);
  });

  it('refuses a workspace outside the allowlist, and keeps the socket open', async () => {
    const socket = await connect();
    socket.send(commandFrame('session.start', { workspacePath: '/etc' }));

    const error = await socket.next();
    expect(error).toMatchObject({ kind: 'error' });
    expect(error.payload).toMatchObject({ code: 'WORKSPACE_NOT_ALLOWED', httpEquivalent: 403 });
    expect(socket.isOpen).toBe(true);
  });

  it('streams a turn as events of our contract, never as SDK messages', async () => {
    const socket = await connect();
    const sessionId = await start(socket);

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));

    const completed = await until(socket, 'turn.completed');
    expect(completed.payload).toMatchObject({
      costUsd: expect.any(String),
      durationMs: expect.any(Number),
    });
  });

  it('numbers every event of a session, without a gap', async () => {
    const socket = await connect();
    const sessionId = await start(socket);
    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));

    const seqs: number[] = [];
    for (;;) {
      const frame = await socket.next();
      if (frame.kind === 'event') {
        seqs.push(frame.seq ?? -1);
      }
      if (frame.type === 'turn.completed') {
        break;
      }
    }

    // Assigned in one place, in the hub. Two things numbering the same stream is a replay that
    // silently skips or repeats, and the client cannot tell which.
    expect(seqs).toEqual(seqs.map((_value, index) => index + 2));
  });

  it('announces `waitingPermission` distinctly from `running`', async () => {
    const socket = await connect();
    const sessionId = await start(socket);
    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));

    const statuses: string[] = [];
    let ended = false;

    // The status follows the event that caused it, so `idle` arrives **after** `turn.completed`:
    // the loop keeps reading one step past the end of the turn rather than stopping on it.
    while (!ended || statuses.at(-1) !== 'idle') {
      const frame = await socket.next();

      if (frame.type === 'session.statusChanged') {
        statuses.push(String(frame.payload?.['status']));
      }
      if (frame.type === 'turn.completed') {
        ended = true;
      }
    }

    expect(statuses).toContain('thinking');
    expect(statuses).toContain('running');
    expect(statuses.at(-1)).toBe('idle');
  });

  it('fans the same events out to a second connection that attached — S-32', async () => {
    const first = await connect();
    const sessionId = await start(first);

    const second = await connect();
    second.send(commandFrame('session.attach', { sessionId }));

    const attached = await second.next();
    expect(attached).toMatchObject({ kind: 'ack', type: 'session.attached' });

    first.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));

    expect((await until(second, 'turn.completed')).sessionId).toBe(sessionId);
  });

  it('replays what a reconnecting client missed — S-33', async () => {
    const first = await connect();
    const sessionId = await start(first);
    first.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));
    await until(first, 'turn.completed');

    const late = await connect();
    late.send(commandFrame('session.attach', { sessionId, resumeFromSeq: 1 }));

    const attached = await late.next();
    expect(attached.payload).toMatchObject({ gap: false });
    expect(Number(attached.payload?.['replayed'])).toBeGreaterThan(0);
  });

  it('records every tool of the turn, and asks about fewer — ADR-011', async () => {
    const socket = await connect();
    const sessionId = await start(socket);
    record.hooked.length = 0;
    record.asked.length = 0;

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));
    await until(socket, 'turn.completed');

    expect(record.hooked.length).toBeGreaterThan(record.asked.length);
  });

  it('queues a prompt that arrives during a turn — S-22', async () => {
    const socket = await connect();
    const sessionId = await start(socket);
    const before = record.prompts.length;

    socket.send(commandFrame('session.prompt', { sessionId, text: 'first' }));
    socket.send(commandFrame('session.prompt', { sessionId, text: 'second' }));
    await until(socket, 'turn.completed');
    await until(socket, 'turn.completed');

    expect(record.prompts.slice(before)).toEqual(['first', 'second']);
  });

  it('drives a running session: interrupt, model, mode and language', async () => {
    // The wiring of every command, through the real container and a real socket. The shape they
    // share is unit-tested on `ContractCommandHandler`; what is proved here is that each one is
    // bound to the use case it claims to be bound to.
    const socket = await connect();
    const sessionId = await start(socket);

    for (const command of [
      commandFrame('session.interrupt', { sessionId }),
      commandFrame('session.setModel', { sessionId, model: 'claude-opus-5' }),
      commandFrame('session.setPermissionMode', { sessionId, mode: 'acceptEdits' }),
      commandFrame('session.setLocale', { locale: 'pt-BR' }),
    ]) {
      socket.send(command);

      const ack = await socket.next();
      expect(ack).toMatchObject({ kind: 'ack', type: 'command.accepted' });
    }
  });

  it('delivers a session to a connection once, however often it attaches — S-37', async () => {
    // A reconnect racing a screen change asks twice, and a client that received everything twice
    // would render every message twice.
    const socket = await connect();
    const sessionId = await start(socket);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      socket.send(commandFrame('session.attach', { sessionId }));
      expect(await until(socket, 'session.attached')).toMatchObject({ kind: 'ack' });
    }

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));

    const seqs: number[] = [];
    for (;;) {
      const frame = await socket.next();
      if (frame.kind === 'event') {
        seqs.push(frame.seq ?? -1);
      }
      if (frame.type === 'turn.completed') {
        break;
      }
    }

    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('refuses a command whose frame does not match the contract, and stays open', async () => {
    const socket = await connect();
    const sessionId = await start(socket);

    socket.send(commandFrame('session.setPermissionMode', { sessionId, mode: 'yolo' }));

    const error = await socket.next();
    expect(error.payload).toMatchObject({ code: 'INVALID_INPUT' });
    expect(socket.isOpen).toBe(true);
  });

  it('closes a session and releases its subprocess', async () => {
    const socket = await connect();
    const sessionId = await start(socket);
    const before = record.closes;

    socket.send(commandFrame('session.close', { sessionId }));

    const closed = await until(socket, 'session.closed');
    expect(closed.payload).toMatchObject({ sessionId, reason: 'closedByUser' });
    expect(record.closes).toBeGreaterThan(before);
    started.length = 0;
  });

  it('answers a command for a closed session as it answers one for a missing session', async () => {
    const socket = await connect();
    const sessionId = await start(socket);
    socket.send(commandFrame('session.close', { sessionId }));
    await until(socket, 'session.closed');
    started.length = 0;

    socket.send(commandFrame('session.prompt', { sessionId, text: 'hello' }));

    const error = await until(socket, 'error');
    expect(error.payload).toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('stops delivering to a connection that detached, and resumes when it attaches back — S-01', async () => {
    const watcher = await connect();
    const sessionId = await start(watcher);

    watcher.send(commandFrame('session.detach', { sessionId }));
    expect(await watcher.next()).toMatchObject({
      kind: 'ack',
      payload: { command: 'session.detach' },
    });

    // A second connection keeps the session busy. The detached one must not see any of it, which
    // is the whole point of the command.
    const other = await connect();
    other.send(commandFrame('session.attach', { sessionId }));
    await other.next();
    other.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));
    await until(other, 'turn.completed');

    // Fan-out is synchronous, so by the time `other` holds the end of the turn the server has
    // delivered everything it was going to. Asking the detached socket now is a decision, not a
    // race: an event would be queued ahead of this ack.
    watcher.send(commandFrame('session.detach', { sessionId }));
    expect(await watcher.next()).toMatchObject({ kind: 'ack' });

    watcher.send(commandFrame('session.attach', { sessionId, resumeFromSeq: 0 }));
    const reattached = await watcher.next();
    expect(reattached).toMatchObject({ type: 'session.attached', payload: { gap: false } });
    expect(Number(reattached.payload?.['replayed'])).toBeGreaterThan(0);
  });

  it('never uses a sequence twice, however many connections are watching — S-32', async () => {
    const first = await connect();
    const sessionId = await start(first);

    const second = await connect();
    second.send(commandFrame('session.attach', { sessionId }));
    await second.next();

    first.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));

    const seqs: number[] = [];
    for (;;) {
      const frame = await second.next();
      if (frame.kind === 'event') {
        seqs.push(frame.seq ?? -1);
      }
      if (frame.type === 'turn.completed') {
        break;
      }
    }

    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('refuses the session beyond the configured limit, and leaves no subprocess — D-05', async () => {
    // Ten is a measured number (~222 MB and exactly one subprocess each), so the refusal is an
    // ordinary path rather than a remote edge case: it has to be translated, and it has to leave
    // nothing running behind it.
    const socket = await connect();
    const before = record.closes;
    let refusal: Envelope | null = null;

    // Opened until one is refused rather than a fixed ten: the suite shares one registry with the
    // running application, so the number already open is not this test's to know.
    for (let attempt = 0; attempt < 12 && refusal === null; attempt += 1) {
      socket.send(commandFrame('session.start', { workspacePath: root }));
      const answer = await socket.next();

      if (answer.kind === 'error') {
        refusal = answer;
        break;
      }

      started.push({
        socket,
        sessionId: String((await until(socket, 'session.started')).payload?.['sessionId']),
      });
    }

    expect(refusal?.payload).toMatchObject({
      code: 'SESSION_LIMIT_REACHED',
      httpEquivalent: 429,
      messageKey: 'session.error.limitReached',
      params: { limit: 10 },
    });
    expect(record.closes).toBe(before);
  });

  it("never lets one user reach another's session", async () => {
    const mine = await connect();
    const sessionId = await start(mine);

    const theirs = await connect('auth|stranger');
    theirs.send(commandFrame('session.attach', { sessionId }));

    const error = await theirs.next();
    // `403`: the session is running and it is not theirs. `404` is reserved for a session that
    // is not there — two facts, two answers ([D-17](../../../../../../docs/plans/01-live-session/decisions.md)).
    expect(error.payload).toMatchObject({ code: 'FORBIDDEN', httpEquivalent: 403 });
  });

  it("refuses to let one user close another's session — S-38", async () => {
    const mine = await connect();
    const sessionId = await start(mine);

    const theirs = await connect('auth|stranger');
    theirs.send(commandFrame('session.close', { sessionId }));

    expect((await theirs.next()).payload).toMatchObject({
      code: 'FORBIDDEN',
      httpEquivalent: 403,
    });

    // And it really closed nothing: the owner's session is still there to be prompted.
    mine.send(commandFrame('session.prompt', { sessionId, text: 'still mine' }));
    await until(mine, 'turn.completed');
  });
});
