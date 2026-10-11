import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';
import { isSessionTasksChangedPayload } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/engines/claude/query.factory';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/**
 * The task list of the agent on the session stream (plan 28, B-22): the recorded `todo-write-turn`
 * writes its list three times, and each write reaches every client as one `session.tasksChanged`
 * with the whole list, numbered like any event of the session — and replayed, once, to a client that
 * comes back (S-66, S-67).
 */
describe('the task list, over the socket', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  const open: TestSocket[] = [];
  const started: { socket: TestSocket; sessionId: string }[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    harness = await startTestApp(
      database.url,
      identity,
      (builder) =>
        builder
          .overrideProvider(QUERY_FACTORY)
          .useValue(scriptedSdk({ fixture: 'todo-write-turn' }).createQuery),
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
    for (let taken = 0; taken < limit; taken += 1) {
      const frame = await socket.next();
      if (frame.type === type) {
        return frame;
      }
    }

    throw new Error(`no ${type}`);
  }

  /** Every frame up to the end of the turn, the end included. */
  async function turnOf(socket: TestSocket): Promise<Envelope[]> {
    const frames: Envelope[] = [];
    for (;;) {
      const frame = await socket.next();
      frames.push(frame);
      if (frame.type === 'turn.completed') {
        return frames;
      }
    }
  }

  async function prompted(socket: TestSocket): Promise<{ sessionId: string; frames: Envelope[] }> {
    socket.send(commandFrame('session.start', { workspacePath: root }));
    await socket.next();
    const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);
    started.push({ socket, sessionId });

    socket.send(commandFrame('session.prompt', { sessionId, text: 'write the files' }));
    return { sessionId, frames: await turnOf(socket) };
  }

  const tasksOf = (frames: readonly Envelope[]) =>
    frames.filter((frame) => frame.type === 'session.tasksChanged');

  it('publishes each change of the list as the whole list, numbered, after its call — S-66', async () => {
    const { sessionId, frames } = await prompted(await connect());
    const changes = tasksOf(frames);

    expect(changes).toHaveLength(3);
    for (const change of changes) {
      expect(change).toMatchObject({ kind: 'event', sessionId, seq: expect.any(Number) });
      expect(isSessionTasksChangedPayload(change.payload)).toBe(true);
    }
    expect(
      changes.map((change) =>
        (change.payload?.['tasks'] as { status: string }[]).map((task) => task.status),
      ),
    ).toEqual([
      ['pending', 'pending', 'pending'],
      ['inProgress', 'pending', 'pending'],
      ['completed', 'pending', 'pending'],
    ]);
    // Right after the end of the call that changed it.
    const first = frames.indexOf(changes[0] as Envelope);
    expect(frames[first - 1]?.type).toBe('tool.completed');
  });

  it('replays each change once to a client that comes back, in its order — S-67', async () => {
    const { sessionId, frames } = await prompted(await connect());
    const live = tasksOf(frames);

    const late = await connect();
    late.send(commandFrame('session.attach', { sessionId, resumeFromSeq: 1 }));
    const attached = await until(late, 'session.attached');
    const replayed: Envelope[] = [];
    for (let n = 0; n < Number(attached.payload?.['replayed']); n += 1) {
      replayed.push(await late.next());
    }

    const again = tasksOf(replayed);
    expect(again.map((frame) => frame.seq)).toEqual(live.map((frame) => frame.seq));
    expect(again.map((frame) => frame.payload)).toEqual(live.map((frame) => frame.payload));
    expect(new Set(again.map((frame) => frame.seq)).size).toBe(again.length);
  });
});
