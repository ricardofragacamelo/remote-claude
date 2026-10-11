import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/engines/claude/query.factory';
import { SessionRegistry } from '@application/session';
import { SessionId } from '@domain/session';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/**
 * `session.compact` over the real socket (plan 28, B-23).
 *
 * The client asks for a compaction and never says how: the server sends the engine's own prompt
 * through the queue, acknowledged like a prompt — the recorded `compact-turn` then reports the
 * compaction. An engine without `compaction` refuses with the capability (S-69, S-70).
 */
describe('compacting a conversation, over the socket', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  let scripted: ReturnType<typeof scriptedSdk>;
  const open: TestSocket[] = [];
  const started: { socket: TestSocket; sessionId: string }[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    scripted = scriptedSdk({ fixture: 'compact-turn' });

    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
    );
  });

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

  async function until(socket: TestSocket, type: string, limit = 800): Promise<Envelope> {
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

  async function start(socket: TestSocket): Promise<string> {
    socket.send(commandFrame('session.start', { workspacePath: root }));
    await socket.next();

    const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);
    started.push({ socket, sessionId });
    return sessionId;
  }

  it("acknowledges the compaction, sends the engine's prompt and reports it done — S-69", async () => {
    const socket = await connect();
    const sessionId = await start(socket);
    const before = scripted.record.prompts.length;

    socket.send(commandFrame('session.compact', { sessionId }));

    expect(await until(socket, 'command.accepted')).toMatchObject({ kind: 'ack' });
    expect((await until(socket, 'session.compacted')).sessionId).toBe(sessionId);
    expect(scripted.record.prompts.slice(before)).toEqual(['/compact']);
  });

  it('refuses a compaction the engine of the session cannot do, and sends nothing — S-70', async () => {
    const socket = await connect();
    const sessionId = await start(socket);
    const live = harness.app.get(SessionRegistry).find(SessionId.create(sessionId));
    if (live === null) throw new Error('the session just started is not live');
    // The engine of this session, as one without the capability would describe itself.
    Object.defineProperty(live.handle, 'capabilities', {
      value: { ...live.handle.capabilities, compaction: false },
    });
    const before = scripted.record.prompts.length;

    socket.send(commandFrame('session.compact', { sessionId }));

    expect((await until(socket, 'error')).payload).toMatchObject({
      code: 'ENGINE_CAPABILITY_UNAVAILABLE',
      params: { capability: 'compaction' },
    });
    expect(scripted.record.prompts.slice(before)).toEqual([]);
    expect(socket.isOpen).toBe(true);
  });

  it('refuses a compaction of a session that is not there', async () => {
    const socket = await connect();

    socket.send(commandFrame('session.compact', { sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ' }));

    expect((await until(socket, 'error')).payload).toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });
});
