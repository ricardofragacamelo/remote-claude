import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import type { Envelope } from '@remote-claude/contracts';

import { SessionRegistry } from '@application/session';
import { SessionId } from '@domain/session';
import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import type { QueryFactory } from '@adapter/outbound/claude/query.factory';
import { TRANSCRIPT_SDK } from '@adapter/outbound/claude/transcript-sdk';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { SnapshotPurgeJob } from '@infra/jobs/snapshot-purge.job';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptOptions } from '../../../../fakes/agent-sdk/scripted-query';
import { ScriptedTranscripts } from '../../../../fakes/agent-sdk/scripted-transcripts';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/** What the recorded tool turn writes: one file, `summary.md`, in the workspace. */
const WRITTEN = 'The project has two goals: safety and speed.\n';

/** The prompt of a turn that writes `summary.md`, replayed from a real run. */
const WRITING_TURN = '[fixture:tool-turn] summarise the notes';

/**
 * Undoing what a session wrote, over the real gateway — plan 04, F4.
 *
 * Everything a client sees is asked the way a client asks it: the preview over HTTP, the undo as a
 * `session.rewindFiles` on a real socket, the outcome as `session.rewound`. Behind it is the real
 * container: the journal in PostgreSQL through migration `0013`, the snapshot blobs on disk, the
 * trail with its CHECK, and the files themselves — written by the scripted CLI where the recording
 * says the real one wrote them, and put back by our undo.
 */
describe('undoing what a session wrote', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  let token: string;
  let store: ScriptedTranscripts;
  let script: ScriptOptions;

  const open: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    store = new ScriptedTranscripts();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    const createQuery: QueryFactory = (params) => scriptedSdk(script).createQuery(params);

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
      {
        RC_PERMISSION_TIMEOUT_MS: '5000',
        // Any snapshot at all is over the ceiling, so a purge removes everything it may.
        RC_CHECKPOINT_MAX_STORE_BYTES: '1',
        // Every test opens its own sessions and most leave them running; the limit has scenarios
        // of its own (plan 01, S-88), and here it would only make the last tests depend on the
        // first ones.
        RC_SESSION_MAX_CONCURRENT: '32',
      },
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

  let workspace: string;

  beforeEach(({ task }) => {
    // A workspace per test, so what one test wrote is never another's baseline.
    workspace = path.join(root, task.id);
    mkdirSync(workspace, { recursive: true });
    script = { fixture: 'text-turn', performWritesIn: workspace };
  });

  const summary = (): string => path.join(workspace, 'summary.md');

  const db = (): PersistenceContext['db'] =>
    harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT).db;

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

  async function until(socket: TestSocket, type: string, limit = 400): Promise<Envelope> {
    for (let taken = 0; taken < limit; taken += 1) {
      const frame = await socket.next();

      if (frame.type === type) {
        return frame;
      }
    }

    throw new Error(`no ${type} in ${String(limit)} frames`);
  }

  async function started(
    socket: TestSocket,
    extra: Record<string, unknown> = {},
  ): Promise<{ sessionId: string; conversation: string }> {
    socket.send(commandFrame('session.start', { workspacePath: workspace, ...extra }));
    const frame = await until(socket, 'session.started');

    return {
      sessionId: String(frame.payload?.['sessionId']),
      conversation: String(frame.payload?.['claudeSessionId']),
    };
  }

  /** One turn, with every question the recording asks answered yes, until it completes. */
  async function turn(socket: TestSocket, sessionId: string, text = WRITING_TURN): Promise<void> {
    socket.send(commandFrame('session.prompt', { sessionId, text }));

    for (let taken = 0; taken < 1_000; taken += 1) {
      const frame = await socket.next();

      if (frame.type === 'permission.requested') {
        socket.send(
          commandFrame(
            'permission.resolve',
            { requestId: frame.payload?.['requestId'], decision: 'allow' },
            { kind: 'response', correlationId: frame.id },
          ),
        );
      }

      if (frame.type === 'turn.completed') {
        return;
      }
    }

    throw new Error('the turn never completed');
  }

  interface Preview {
    promptId: string;
    label: string | null;
    files: { path: string; outcome: string; action?: string; reason?: string }[];
  }

  async function checkpoints(sessionId: string): Promise<Preview[]> {
    const response = await request(harness.app.getHttpServer())
      .get(`/sessions/${sessionId}/checkpoints`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    return (response.body as { checkpoints: Preview[] }).checkpoints;
  }

  /** Sends the undo and answers the first frame that is about it: the outcome or a refusal. */
  async function rewind(socket: TestSocket, sessionId: string, promptId: string) {
    const command = commandFrame('session.rewindFiles', { sessionId, promptId });
    socket.send(command);

    for (let taken = 0; taken < 50; taken += 1) {
      const frame = await socket.next();

      if (frame.kind === 'error' && frame.correlationId === command['id']) {
        return { refusal: frame, outcome: null };
      }
      if (frame.type === 'session.rewound') {
        return { refusal: null, outcome: frame };
      }
    }

    throw new Error('the undo was never answered');
  }

  it('shows what will go back, puts it back and says what it did — S-37, S-38', async () => {
    const socket = await connect();
    const { sessionId } = await started(socket);
    await turn(socket, sessionId);
    expect(readFileSync(summary(), 'utf8')).toBe(WRITTEN);

    const [point] = await checkpoints(sessionId);
    expect(point).toMatchObject({
      label: WRITING_TURN,
      files: [{ path: summary(), outcome: 'revert', action: 'delete' }],
    });

    const { outcome } = await rewind(socket, sessionId, String(point?.promptId));

    expect(outcome?.payload).toEqual({
      promptId: point?.promptId,
      reverted: [{ path: summary(), action: 'deleted' }],
      preserved: [],
      unchanged: [],
      failed: [],
    });
    expect(existsSync(summary())).toBe(false);
  });

  it('restores a file the turn changed to what it held before', async () => {
    writeFileSync(summary(), 'what was there before\n', 'utf8');
    const socket = await connect();
    const { sessionId } = await started(socket);
    await turn(socket, sessionId);

    const [point] = await checkpoints(sessionId);
    const { outcome } = await rewind(socket, sessionId, String(point?.promptId));

    expect(outcome?.payload).toMatchObject({ reverted: [{ path: summary(), action: 'restored' }] });
    expect(readFileSync(summary(), 'utf8')).toBe('what was there before\n');
  });

  it('enters the trail with the point and every path — S-42', async () => {
    const socket = await connect();
    const { sessionId } = await started(socket);
    await turn(socket, sessionId);
    const [point] = await checkpoints(sessionId);

    await rewind(socket, sessionId, String(point?.promptId));

    const rows = await db().execute<{ kind: string; subject_label: string; details: unknown }>(
      sql`SELECT "kind", "subject_label", "details" FROM "audit_events"
          WHERE "subject_id" = ${String(point?.promptId)}`,
    );
    expect(rows.rows).toEqual([
      {
        kind: 'session.filesRewound',
        subject_label: workspace,
        details: expect.objectContaining({
          sessionId,
          files: [{ path: summary(), outcome: 'revert', action: 'delete' }],
        }) as unknown,
      },
    ]);
  });

  it('is idempotent: the second undo to the same point finds everything there — S-41', async () => {
    const socket = await connect();
    const { sessionId } = await started(socket);
    await turn(socket, sessionId);
    const [point] = await checkpoints(sessionId);

    await rewind(socket, sessionId, String(point?.promptId));
    const { outcome } = await rewind(socket, sessionId, String(point?.promptId));

    expect(outcome?.payload).toMatchObject({ reverted: [], unchanged: [{ path: summary() }] });
  });

  it('preserves a file somebody edited after the session, and says why — S-63', async () => {
    const socket = await connect();
    const { sessionId } = await started(socket);
    await turn(socket, sessionId);
    writeFileSync(summary(), 'my own words\n', 'utf8');

    const [point] = await checkpoints(sessionId);
    expect(point?.files).toEqual([
      { path: summary(), outcome: 'preserve', reason: 'modifiedOutside' },
    ]);

    const { outcome } = await rewind(socket, sessionId, String(point?.promptId));

    expect(outcome?.payload).toMatchObject({
      reverted: [],
      preserved: [{ path: summary(), reason: 'modifiedOutside' }],
    });
    expect(readFileSync(summary(), 'utf8')).toBe('my own words\n');
  });

  it('never touches a file the session did not — S-40', async () => {
    const untouched = path.join(workspace, 'mine.md');
    writeFileSync(untouched, 'mine\n', 'utf8');
    const socket = await connect();
    const { sessionId } = await started(socket);
    await turn(socket, sessionId);
    const [point] = await checkpoints(sessionId);

    await rewind(socket, sessionId, String(point?.promptId));

    expect(point?.files.map((file) => file.path)).toEqual([summary()]);
    expect(readFileSync(untouched, 'utf8')).toBe('mine\n');
  });

  it('refuses while a turn is running, and touches nothing — S-43', async () => {
    const socket = await connect();
    const { sessionId } = await started(socket);
    await turn(socket, sessionId);
    const [point] = await checkpoints(sessionId);

    // A turn that does not end until it is interrupted: the session sits mid-turn.
    socket.send(commandFrame('session.prompt', { sessionId, text: '[hold] keep going' }));
    for (;;) {
      const frame = await until(socket, 'session.statusChanged');
      if (frame.payload?.['status'] === 'thinking') {
        break;
      }
    }

    const { refusal } = await rewind(socket, sessionId, String(point?.promptId));

    expect(refusal?.payload).toMatchObject({
      code: 'SESSION_LOCKED',
      messageKey: 'session.error.locked',
    });
    expect(readFileSync(summary(), 'utf8')).toBe(WRITTEN);

    socket.send(commandFrame('session.interrupt', { sessionId }));
    await until(socket, 'turn.completed');
  });

  it('refuses a prompt that arrives while the files go back, and runs no turn — plan 05, S-58', async () => {
    const socket = await connect();
    const { sessionId } = await started(socket);
    await turn(socket, sessionId);
    const [point] = await checkpoints(sessionId);

    // Back to back: the undo takes the lock before its first await, and the prompt is checked
    // while the undo is still reading the journal and writing the trail.
    const undo = commandFrame('session.rewindFiles', {
      sessionId,
      promptId: String(point?.promptId),
    });
    const prompt = commandFrame('session.prompt', { sessionId, text: 'carry on' });
    socket.send(undo);
    socket.send(prompt);

    let refusal: Envelope | null = null;
    let rewound: Envelope | null = null;
    for (let taken = 0; taken < 50 && (refusal === null || rewound === null); taken += 1) {
      const frame = await socket.next();
      if (frame.kind === 'error' && frame.correlationId === prompt['id']) {
        refusal = frame;
      }
      if (frame.type === 'session.rewound') {
        rewound = frame;
      }
    }

    expect(refusal?.payload).toMatchObject({
      code: 'SESSION_LOCKED',
      params: { reason: 'rewindRunning' },
    });
    expect(rewound).not.toBeNull();
    // The refused prompt never reached the CLI: the session is idle, not thinking.
    expect(harness.app.get(SessionRegistry).find(SessionId.create(sessionId))?.session.status).toBe(
      'idle',
    );
  });

  it('refuses a point that is not one of the session — S-61', async () => {
    const socket = await connect();
    const { sessionId } = await started(socket);

    const { refusal } = await rewind(socket, sessionId, 'not-a-point');

    expect(refusal?.payload).toMatchObject({
      code: 'INVALID_INPUT',
      messageKey: 'session.error.rewindTargetUnknown',
    });
  });

  it('refuses a session that ended — S-39', async () => {
    const socket = await connect();
    const { sessionId } = await started(socket);
    await turn(socket, sessionId);
    const [point] = await checkpoints(sessionId);
    socket.send(commandFrame('session.close', { sessionId }));
    await until(socket, 'session.closed');

    const { refusal } = await rewind(socket, sessionId, String(point?.promptId));

    expect(refusal?.payload).toMatchObject({ code: 'SESSION_NOT_FOUND' });
    expect(readFileSync(summary(), 'utf8')).toBe(WRITTEN);
    const preview = await request(harness.app.getHttpServer())
      .get(`/sessions/${sessionId}/checkpoints`)
      .set('Authorization', `Bearer ${token}`);
    expect(preview.status).toBe(404);
  });

  it('says what did not go back, and why it is not what was asked — S-44, S-62', async () => {
    writeFileSync(summary(), 'what was there before\n', 'utf8');
    const socket = await connect();
    const { sessionId } = await started(socket);
    await turn(socket, sessionId);
    const [point] = await checkpoints(sessionId);
    // The snapshot is gone from the store: the undo has nothing to put back.
    rmSync(path.join(String(process.env['RC_CHECKPOINT_DIR']), sessionId), {
      recursive: true,
      force: true,
    });

    const { outcome } = await rewind(socket, sessionId, String(point?.promptId));
    const incomplete = await until(socket, 'error');

    expect(outcome?.payload).toMatchObject({ reverted: [], failed: [{ path: summary() }] });
    expect(incomplete.payload).toMatchObject({
      code: 'INTERNAL_ERROR',
      messageKey: 'session.error.rewindIncomplete',
      params: { failed: 1 },
    });
    expect(readFileSync(summary(), 'utf8')).toBe(WRITTEN);
  });

  it('reaches the points of the earlier session of a conversation continued in place — S-59', async () => {
    const socket = await connect();
    const first = await started(socket);
    await turn(socket, first.sessionId);
    const [point] = await checkpoints(first.sessionId);
    socket.send(commandFrame('session.close', { sessionId: first.sessionId }));
    await until(socket, 'session.closed');
    store.add({ sessionId: first.conversation, directory: workspace, cwd: workspace });

    const resumed = await started(socket, { resumeSessionId: first.conversation });
    expect(resumed.conversation).toBe(first.conversation);

    const points = await checkpoints(resumed.sessionId);
    expect(points.map((candidate) => candidate.promptId)).toEqual([point?.promptId]);

    const { outcome } = await rewind(socket, resumed.sessionId, String(point?.promptId));
    expect(outcome?.payload).toMatchObject({ reverted: [{ path: summary(), action: 'deleted' }] });
  });

  it('purges above the ceiling, and never what a live session still reaches — S-67', async () => {
    writeFileSync(summary(), 'kept as a snapshot\n', 'utf8');
    const socket = await connect();
    const ended = await started(socket);
    await turn(socket, ended.sessionId);
    socket.send(commandFrame('session.close', { sessionId: ended.sessionId }));
    await until(socket, 'session.closed');

    writeFileSync(summary(), 'kept as a snapshot too\n', 'utf8');
    const live = await started(socket);
    await turn(socket, live.sessionId);

    const removed = await harness.app.get(SnapshotPurgeJob).purgeNow();
    const kept = readdirSync(String(process.env['RC_CHECKPOINT_DIR']));

    expect(removed).toContain(ended.sessionId);
    expect(removed).not.toContain(live.sessionId);
    expect(kept).toContain(live.sessionId);
    expect(kept).not.toContain(ended.sessionId);

    const rows = await db().execute<{ session_id: string }>(
      sql`SELECT DISTINCT "session_id" FROM "turn_file_checkpoints"
          WHERE "session_id" IN (${ended.sessionId}, ${live.sessionId})`,
    );
    expect(rows.rows.map((row) => row.session_id)).toEqual([live.sessionId]);

    // What the live session reaches still goes back.
    const [point] = await checkpoints(live.sessionId);
    const { outcome } = await rewind(socket, live.sessionId, String(point?.promptId));
    expect(outcome?.payload).toMatchObject({ reverted: [{ path: summary(), action: 'restored' }] });
  });
});
