import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import type { QueryFactory } from '@adapter/outbound/claude/query.factory';
import { TRANSCRIPT_SDK } from '@adapter/outbound/claude/transcript-sdk';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptRecord } from '../../../../fakes/agent-sdk/scripted-query';
import {
  capturedTranscript,
  ScriptedTranscripts,
} from '../../../../fakes/agent-sdk/scripted-transcripts';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { waitFor } from '../../../../support/app/wait-for';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/**
 * The provenance of a session opened over the gateway, and the history of it — plan 04, F0.
 *
 * The session is opened the way a client opens one: a `session.start` on a real socket, against
 * the real container and a real PostgreSQL. What is proved is the part no unit can: that the row
 * saying "this conversation is ours" is in the database **before** the SDK is ever called, with
 * the very id the SDK is told to use — and that the history reads it back as `ours`.
 */
describe('the provenance of a session opened here', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let record: ScriptRecord;
  let root: string;
  let store: ScriptedTranscripts;
  let token: string;

  /** Every `query()` the backend asked for, with the conversation id it was told to use. */
  const spawned: { sessionId: unknown }[] = [];
  const open: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    const scripted = scriptedSdk({ fixture: 'text-turn' });
    record = scripted.record;

    const createQuery: QueryFactory = (params) => {
      // Counted synchronously, at the very call that would spawn the CLI.
      spawned.push({ sessionId: params.options.sessionId });
      return scripted.createQuery(params);
    };

    harness = await startTestApp(
      database.url,
      identity,
      (builder) =>
        builder
          .overrideProvider(QUERY_FACTORY)
          .useValue(createQuery)
          .overrideProvider(TRANSCRIPT_SDK)
          .useValue({
            listSessions: (options: never) => store.listSessions(options),
            getSessionInfo: (id: string) => store.getSessionInfo(id),
            getSessionMessages: (id: string) => store.getSessionMessages(id),
          }),
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

  beforeEach(async () => {
    store = new ScriptedTranscripts();
    spawned.length = 0;
    await db().execute(sql`TRUNCATE TABLE "session_origins"`);
  });

  const db = (): PersistenceContext['db'] =>
    harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT).db;

  async function origins(): Promise<
    { claude_session_id: string; user_id: string; workspace_path: string }[]
  > {
    const rows = await db().execute<{
      claude_session_id: string;
      user_id: string;
      workspace_path: string;
    }>(sql`SELECT "claude_session_id", "user_id", "workspace_path" FROM "session_origins"`);
    return rows.rows;
  }

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

  async function until(socket: TestSocket, type: string, limit = 200): Promise<Envelope> {
    for (let taken = 0; taken < limit; taken += 1) {
      const frame = await socket.next();

      if (frame.type === type) {
        return frame;
      }
    }

    throw new Error(`no ${type} in ${String(limit)} frames`);
  }

  /** Opens a session and answers its id, once `session.started` arrived. */
  async function start(socket: TestSocket): Promise<string> {
    socket.send(commandFrame('session.start', { workspacePath: root }));
    return String((await until(socket, 'session.started')).payload?.['sessionId']);
  }

  it('records the conversation as ours, with the id the SDK is told to use — S-71', async () => {
    const socket = await connect();
    const sessionId = await start(socket);

    const [row] = await origins();

    expect(row).toMatchObject({ user_id: SUBJECT, workspace_path: root });
    expect(record.options?.sessionId).toBe(row?.claude_session_id);
    expect(spawned.map((each) => each.sessionId)).toEqual([row?.claude_session_id]);

    socket.send(commandFrame('session.close', { sessionId }));
    await until(socket, 'session.closed');
  });

  it('opens nothing when the provenance cannot be written — S-71', async () => {
    // The table goes away underneath the application: the write fails, and it must fail before any
    // subprocess exists. A session whose origin is lost would read as somebody else's for ever.
    await db().execute(sql`ALTER TABLE "session_origins" RENAME TO "session_origins_away"`);

    try {
      const socket = await connect();
      socket.send(commandFrame('session.start', { workspacePath: root }));

      const error = await until(socket, 'error');

      expect(error.payload).toMatchObject({ code: 'INTERNAL_ERROR', httpEquivalent: 500 });
      expect(spawned).toEqual([]);
      expect(socket.isOpen).toBe(true);
    } finally {
      await db().execute(sql`ALTER TABLE "session_origins_away" RENAME TO "session_origins"`);
    }
  });

  it('lists what was opened here as `ours` — S-01', async () => {
    const socket = await connect();
    const sessionId = await start(socket);
    const [row] = await origins();
    const claudeSessionId = String(row?.claude_session_id);
    store.add({ sessionId: claudeSessionId, directory: root, cwd: root });

    const response = await request(harness.app.getHttpServer())
      .get('/transcripts')
      .query({ workspacePath: root })
      .set('authorization', `Bearer ${token}`);

    expect(response.body.sessions).toEqual([
      expect.objectContaining({ sessionId: claudeSessionId, origin: 'ours' }),
    ]);

    socket.send(commandFrame('session.close', { sessionId }));
    await until(socket, 'session.closed');
  });

  it('finishes the page of a session that ended while it was being read — S-10', async () => {
    const socket = await connect();
    const sessionId = await start(socket);
    const [row] = await origins();
    const claudeSessionId = String(row?.claude_session_id);
    store.add({
      sessionId: claudeSessionId,
      directory: root,
      cwd: root,
      messages: capturedTranscript('text-turn'),
    });
    const gate = store.hold();

    const pending = request(harness.app.getHttpServer())
      .get(`/transcripts/${claudeSessionId}/messages`)
      .set('authorization', `Bearer ${token}`)
      .then((response) => response);
    await waitFor(
      'the read reaching the SDK',
      () => Promise.resolve(store.calls.getSessionMessages.length),
      (calls) => calls === 1,
    );

    // The live session ends while its history is being read. The two are not coupled: the
    // history is Claude's file, and the live session is a process of ours.
    socket.send(commandFrame('session.close', { sessionId }));
    await until(socket, 'session.closed');
    gate.open();

    const response = await pending;

    expect(response.status).toBe(200);
    expect(response.body.session).toMatchObject({ sessionId: claudeSessionId, origin: 'ours' });
    expect(response.body.events.length).toBeGreaterThan(0);
    expect(record.closes).toBeGreaterThan(0);
  });
});
