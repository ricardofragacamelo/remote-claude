import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import type { QueryFactory } from '@adapter/outbound/claude/query.factory';
import { TRANSCRIPT_SDK } from '@adapter/outbound/claude/transcript-sdk';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { ScriptedTranscripts } from '../../../../fakes/agent-sdk/scripted-transcripts';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/** A conversation begun in the editor: nobody here opened it, so nothing here records it. */
const EDITOR = '1f1e1d1c-1b1a-4918-9716-151413121110';

/** What `query()` was told about the conversation, at the very call that would spawn the CLI. */
interface Spawn {
  readonly resume: unknown;
  readonly forkSession: unknown;
  readonly sessionId: unknown;
}

/**
 * Continuing a conversation over the gateway — plan 04, F2.
 *
 * The resume is asked the way a client asks it: a `session.start` with `resumeSessionId`, on a real
 * socket, against the real container and a real PostgreSQL. What no unit proves is here: that the
 * SDK is told to continue in place or to fork according to a row in the database, that the fork's
 * provenance and the trail are really written — the trail through the CHECK of migration `0012` —
 * and that resuming what is live answers as an attach on the wire, with one subprocess behind it.
 */
describe('resuming a conversation', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  let store: ScriptedTranscripts;
  let token: string;

  const spawned: Spawn[] = [];
  const open: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    const scripted = scriptedSdk({ fixture: 'text-turn' });
    const createQuery: QueryFactory = (params) => {
      const { resume, forkSession, sessionId } = params.options;
      spawned.push({ resume, forkSession, sessionId });
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
      // Two, so the limit is reachable in a test: one open and one resumed fill it.
      { RC_SESSION_MAX_CONCURRENT: '2' },
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
    store.add({ sessionId: EDITOR, directory: root, cwd: root });
    spawned.length = 0;
    await db().execute(sql`TRUNCATE TABLE "session_origins"`);
  });

  const db = (): PersistenceContext['db'] =>
    harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT).db;

  async function originOf(claudeSessionId: string): Promise<string | null> {
    const rows = await db().execute<{ user_id: string }>(
      sql`SELECT "user_id" FROM "session_origins" WHERE "claude_session_id" = ${claudeSessionId}`,
    );
    return rows.rows[0]?.user_id ?? null;
  }

  async function trailed(subjectId: string): Promise<string[]> {
    const rows = await db().execute<{ kind: string }>(
      sql`SELECT "kind" FROM "audit_events" WHERE "subject_id" = ${subjectId} ORDER BY "seq"`,
    );
    return rows.rows.map((row) => row.kind);
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

  /** The first of `types` to arrive, whichever it is. */
  async function untilAny(socket: TestSocket, types: readonly string[]): Promise<Envelope> {
    for (let taken = 0; taken < 200; taken += 1) {
      const frame = await socket.next();

      if (types.includes(frame.type)) {
        return frame;
      }
    }

    throw new Error(`none of ${types.join(', ')} in 200 frames`);
  }

  function resume(socket: TestSocket, resumeSessionId: string, workspacePath = root): void {
    socket.send(commandFrame('session.start', { workspacePath, resumeSessionId }));
  }

  async function close(socket: TestSocket, sessionId: string): Promise<void> {
    socket.send(commandFrame('session.close', { sessionId }));
    await until(socket, 'session.closed');
  }

  /** Opens one of ours, closes it, and answers its conversation — filed in the store, as the CLI would. */
  async function anEndedConversationOfOurs(socket: TestSocket): Promise<string> {
    socket.send(commandFrame('session.start', { workspacePath: root }));
    const started = await until(socket, 'session.started');
    const conversation = String(started.payload?.['claudeSessionId']);

    await close(socket, String(started.payload?.['sessionId']));
    store.add({ sessionId: conversation, directory: root, cwd: root });
    spawned.length = 0;

    return conversation;
  }

  it('names the conversation on `session.started` of a fresh session', async () => {
    const socket = await connect();
    socket.send(commandFrame('session.start', { workspacePath: root }));

    const started = await until(socket, 'session.started');
    const conversation = String(started.payload?.['claudeSessionId']);

    expect(await originOf(conversation)).toBe(SUBJECT);
    expect(started.payload).not.toHaveProperty('resumedFrom');

    await close(socket, String(started.payload?.['sessionId']));
  });

  it('continues one of ours in place, and the conversation goes on — S-19, S-59', async () => {
    const socket = await connect();
    const conversation = await anEndedConversationOfOurs(socket);

    resume(socket, conversation);
    const started = await until(socket, 'session.started');

    expect(started.payload).toMatchObject({
      claudeSessionId: conversation,
      resumedFrom: conversation,
      workspacePath: root,
    });
    expect(spawned).toEqual([
      { resume: conversation, forkSession: undefined, sessionId: undefined },
    ]);

    // The conversation goes on: a turn of the resumed session runs and completes.
    const sessionId = String(started.payload?.['sessionId']);
    socket.send(commandFrame('session.prompt', { sessionId, text: 'and then?' }));
    await until(socket, 'turn.completed');

    await close(socket, sessionId);
  });

  it('numbers the resumed session from the start, apart from the history — S-21', async () => {
    const socket = await connect();
    const conversation = await anEndedConversationOfOurs(socket);

    resume(socket, conversation);
    const started = await until(socket, 'session.started');

    expect(started.seq).toBe(1);

    await close(socket, String(started.payload?.['sessionId']));
  });

  it('forks the one begun in the editor under a new id of ours — S-20, S-58', async () => {
    const socket = await connect();

    resume(socket, EDITOR);
    const started = await until(socket, 'session.started');
    const fork = String(started.payload?.['claudeSessionId']);

    expect(fork).not.toBe(EDITOR);
    expect(started.payload).toMatchObject({ resumedFrom: EDITOR });
    expect(spawned).toEqual([{ resume: EDITOR, forkSession: true, sessionId: fork }]);
    // The fork is ours, recorded as such; the original stays the editor's — no row claims it.
    expect(await originOf(fork)).toBe(SUBJECT);
    expect(await originOf(EDITOR)).toBeNull();

    await close(socket, String(started.payload?.['sessionId']));
  });

  it('writes the resume and the fork to the trail — S-27', async () => {
    // Append-only, and the suite shares one database: what counts is what this test added.
    const forksBefore = (await trailed(EDITOR)).length;
    const socket = await connect();
    const conversation = await anEndedConversationOfOurs(socket);

    resume(socket, conversation);
    const inPlace = await until(socket, 'session.started');
    await close(socket, String(inPlace.payload?.['sessionId']));

    resume(socket, EDITOR);
    const forked = await until(socket, 'session.started');
    await close(socket, String(forked.payload?.['sessionId']));

    expect(await trailed(conversation)).toEqual(['session.resumed']);
    expect((await trailed(EDITOR)).slice(forksBefore)).toEqual(['session.forked']);
  });

  it('joins what is already live, as an attach, without a second subprocess — S-24', async () => {
    const socket = await connect();
    resume(socket, EDITOR);
    const started = await until(socket, 'session.started');
    const sessionId = String(started.payload?.['sessionId']);

    const other = await connect();
    resume(other, EDITOR);
    const joined = await untilAny(other, ['session.attached', 'session.started', 'error']);

    expect(joined).toMatchObject({
      kind: 'ack',
      type: 'session.attached',
      payload: {
        sessionId,
        replayed: 0,
        gap: false,
        claudeSessionId: started.payload?.['claudeSessionId'],
        resumedFrom: EDITOR,
      },
    });
    expect(spawned).toHaveLength(1);

    // And it is really attached: what the session says next reaches the one that joined.
    socket.send(commandFrame('session.prompt', { sessionId, text: 'still there?' }));
    await until(other, 'turn.completed');

    await close(socket, sessionId);
  });

  it('makes two resumes arriving together one `query()` — S-25', async () => {
    const first = await connect();
    const second = await connect();

    resume(first, EDITOR);
    resume(second, EDITOR);

    const answers = await Promise.all([
      untilAny(first, ['session.attached', 'session.started']),
      untilAny(second, ['session.attached', 'session.started']),
    ]);

    expect(spawned).toHaveLength(1);
    expect(answers.map((frame) => frame.type).sort()).toEqual([
      'session.attached',
      'session.started',
    ]);
    const ids = answers.map((frame) => frame.payload?.['sessionId']);
    expect(ids[0]).toBe(ids[1]);

    await close(first, String(ids[0]));
  });

  it('refuses a conversation that does not exist — S-22', async () => {
    const socket = await connect();

    resume(socket, '2f2e2d2c-2b2a-4928-a726-252423222120');
    const error = await until(socket, 'error');

    expect(error.payload).toMatchObject({ code: 'SESSION_NOT_FOUND', httpEquivalent: 404 });
    expect(spawned).toEqual([]);
  });

  it('refuses a workspace that left the allowlist — S-23', async () => {
    const socket = await connect();

    resume(socket, EDITOR, '/etc');
    const error = await until(socket, 'error');

    expect(error.payload).toMatchObject({ code: 'WORKSPACE_NOT_ALLOWED', httpEquivalent: 403 });
    expect(store.calls.getSessionInfo).toEqual([]);
    expect(spawned).toEqual([]);
  });

  it('refuses a resume beyond the limit, and spawns nothing — S-26', async () => {
    const socket = await connect();
    const conversation = await anEndedConversationOfOurs(socket);

    socket.send(commandFrame('session.start', { workspacePath: root }));
    const one = await until(socket, 'session.started');
    socket.send(commandFrame('session.start', { workspacePath: root }));
    const two = await until(socket, 'session.started');
    spawned.length = 0;

    resume(socket, conversation);
    const error = await until(socket, 'error');

    expect(error.payload).toMatchObject({ code: 'SESSION_LIMIT_REACHED' });
    expect(spawned).toEqual([]);

    await close(socket, String(one.payload?.['sessionId']));
    await close(socket, String(two.payload?.['sessionId']));
  });

  it('says on the attach which conversation to reload after a gap — B-07', async () => {
    const socket = await connect();
    resume(socket, EDITOR);
    const started = await until(socket, 'session.started');
    const sessionId = String(started.payload?.['sessionId']);

    const late = await connect();
    // A resume point far beyond anything the buffer holds, as after a restart: the ack says so, and
    // says where the history is — which is all the client has once the buffer is gone.
    late.send(commandFrame('session.attach', { sessionId, resumeFromSeq: 10_000 }));
    const attached = await until(late, 'session.attached');

    expect(attached.payload).toMatchObject({
      sessionId,
      claudeSessionId: started.payload?.['claudeSessionId'],
      resumedFrom: EDITOR,
    });

    await close(socket, sessionId);
  });
});
