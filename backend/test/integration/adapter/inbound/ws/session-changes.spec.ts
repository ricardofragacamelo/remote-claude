import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import type { QueryFactory } from '@adapter/outbound/claude/query.factory';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptOptions } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/** The turn the recording replays: two edits of `app.js`, a write over `config.json`, a new `notes.txt`. */
const EDIT_TURN = '[fixture:edit-turn] tidy the greeting';

/** `app.js` before the turn — the two edits far enough apart to be two hunks. */
const APP_BEFORE = [
  "const greeting = 'hello';",
  '// one',
  '// two',
  '// three',
  '// four',
  '// five',
  '// six',
  '// seven',
  'console.log(greeting);',
  '',
].join('\n');

const CONFIG_BEFORE = '{"debug": false}\n';

/** The ceiling of a snapshot in this suite, in bytes. */
const SNAPSHOT_CEILING = 1_000;

/** A tool the turn ran, as `tool.started` said it. */
interface StartedTool {
  readonly toolUseId: string;
  readonly toolName: string;
  readonly path: string | null;
}

function startedTool(frame: Envelope): StartedTool {
  const input = (frame.payload?.['input'] ?? {}) as { file_path?: string };

  return {
    toolUseId: String(frame.payload?.['toolUseId']),
    toolName: String(frame.payload?.['toolName']),
    path: input.file_path ?? null,
  };
}

/**
 * What a session changed on disk, over the real gateway — plan 08, F3.
 *
 * The diff and the changes are asked over HTTP and the rejections over a real socket, the way the
 * panel asks them. Behind them: the journal in PostgreSQL, the snapshots on disk, the trail, and the
 * files the scripted CLI really edited — `Edit` and `Write` both performed where the recording says.
 */
describe('what a session changed on disk', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  let token: string;
  let script: ScriptOptions;
  let workspace: string;

  const open: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    const createQuery: QueryFactory = (params) => scriptedSdk(script).createQuery(params);

    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(createQuery),
      allowlist,
      {
        RC_PERMISSION_TIMEOUT_MS: '5000',
        RC_SESSION_MAX_CONCURRENT: '32',
        // Small enough that one test can seed a file past it (S-107), large enough for the rest.
        RC_CHECKPOINT_MAX_FILE_BYTES: String(SNAPSHOT_CEILING),
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

  beforeEach(({ task }) => {
    workspace = path.join(root, task.id);
    mkdirSync(workspace, { recursive: true });
    writeFileSync(file('app.js'), APP_BEFORE, 'utf8');
    writeFileSync(file('config.json'), CONFIG_BEFORE, 'utf8');
    script = { fixture: 'text-turn', performWritesIn: workspace };
  });

  const file = (name: string): string => path.join(workspace, name);
  const text = (name: string): string => readFileSync(file(name), 'utf8');
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

  async function started(socket: TestSocket): Promise<string> {
    socket.send(commandFrame('session.start', { workspacePath: workspace }));
    return String((await until(socket, 'session.started')).payload?.['sessionId']);
  }

  /** The edit turn, every question answered yes, and the tools it ran, in order. */
  async function editTurn(socket: TestSocket, sessionId: string): Promise<StartedTool[]> {
    socket.send(commandFrame('session.prompt', { sessionId, text: EDIT_TURN }));
    const tools: StartedTool[] = [];

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
      if (frame.type === 'tool.started') {
        tools.push(startedTool(frame));
      }
      if (frame.type === 'turn.completed') {
        return tools;
      }
    }

    throw new Error('the turn never completed');
  }

  const get = (route: string, bearer = token) =>
    request(harness.app.getHttpServer()).get(route).set('Authorization', `Bearer ${bearer}`);

  const toolsNamed = (tools: readonly StartedTool[], name: string): StartedTool[] =>
    tools.filter((tool) => tool.toolName === name);

  /** Sends a command about the files and answers the first frame about it. */
  async function answer(
    socket: TestSocket,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<{ refusal: Envelope | null; outcome: Envelope | null }> {
    const command = commandFrame(type, payload);
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
    throw new Error(`${type} was never answered`);
  }

  async function changeFile(sessionId: string, name: string) {
    const response = await get(
      `/sessions/${sessionId}/changes/file?path=${encodeURIComponent(file(name))}`,
    );
    expect([response.status, response.body]).toEqual([200, expect.anything()]);
    return response.body as {
      kind: string | null;
      revision: string;
      hunks: { id: string }[];
      now: { state: string; content?: string };
      before: { state: string; content?: string };
    };
  }

  describe('the diff of a tool — B-25', () => {
    it('shows each edit, says what the second edit of a turn cannot know, and the writes whole — S-103, S-105, S-106', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      const tools = await editTurn(socket, sessionId);
      const [firstEdit, secondEdit] = toolsNamed(tools, 'Edit');
      const [overConfig, newNotes] = toolsNamed(tools, 'Write');

      const first = await get(`/sessions/${sessionId}/tools/${String(firstEdit?.toolUseId)}/diff`);
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({
        path: file('app.js'),
        toolName: 'Edit',
        before: { state: 'content', content: APP_BEFORE },
        // The second edit wrote the file again: what the first left is not on disk any more.
        after: { state: 'unavailable', reason: 'laterWrite' },
        scope: 'edit',
        hunks: [
          {
            lines: [
              { kind: 'removed', text: "const greeting = 'hello';" },
              { kind: 'added', text: "const greeting = 'hi';" },
            ],
          },
        ],
      });

      const second = await get(
        `/sessions/${sessionId}/tools/${String(secondEdit?.toolUseId)}/diff`,
      );
      expect(second.body).toMatchObject({
        before: { state: 'unavailable', reason: 'laterTouch' },
        after: { state: 'content', content: text('app.js') },
        scope: 'edit',
      });

      const config = await get(
        `/sessions/${sessionId}/tools/${String(overConfig?.toolUseId)}/diff`,
      );
      expect(config.body).toMatchObject({
        scope: 'file',
        before: { state: 'content', content: CONFIG_BEFORE },
        after: { state: 'content', content: '{"debug": true}\n' },
      });

      const notes = await get(`/sessions/${sessionId}/tools/${String(newNotes?.toolUseId)}/diff`);
      expect(notes.body).toMatchObject({
        scope: 'file',
        before: { state: 'absent' },
        hunks: [{ lines: [{ kind: 'added', text: 'done' }] }],
      });
    });

    it('refuses a tool the session does not have, and one that writes no file — S-108, S-109', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      const tools = await editTurn(socket, sessionId);
      const [read] = toolsNamed(tools, 'Read');

      const unknown = await get(`/sessions/${sessionId}/tools/toolu_nothing/diff`);
      expect([unknown.status, unknown.body.error.code]).toEqual([404, 'TOOL_USE_NOT_FOUND']);

      const notWriting = await get(`/sessions/${sessionId}/tools/${String(read?.toolUseId)}/diff`);
      expect([notWriting.status, notWriting.body.error]).toEqual([
        422,
        expect.objectContaining({ code: 'DIFF_NOT_APPLICABLE', params: { toolName: 'Read' } }),
      ]);
    });

    it("refuses somebody else's session, and one that ended — S-110", async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      const [, , edit] = await editTurn(socket, sessionId);
      const stranger = await identity.accessToken({ subject: 'auth|stranger' });

      expect(
        (await get(`/sessions/${sessionId}/tools/${String(edit?.toolUseId)}/diff`, stranger))
          .status,
      ).toBe(403);

      socket.send(commandFrame('session.close', { sessionId }));
      await until(socket, 'session.closed');
      expect(
        (await get(`/sessions/${sessionId}/tools/${String(edit?.toolUseId)}/diff`)).status,
      ).toBe(404);
      expect((await get(`/sessions/${sessionId}/changes`)).status).toBe(404);
    });

    it('says a file too large to snapshot has no before, and keeps the edit — S-107', async () => {
      writeFileSync(
        file('app.js'),
        `${APP_BEFORE}${'// padding\n'.repeat(SNAPSHOT_CEILING / 10)}`,
        'utf8',
      );
      const socket = await connect();
      const sessionId = await started(socket);
      const [firstEdit] = toolsNamed(await editTurn(socket, sessionId), 'Edit');

      const diff = await get(`/sessions/${sessionId}/tools/${String(firstEdit?.toolUseId)}/diff`);

      expect(diff.body).toMatchObject({
        before: { state: 'notRestorable', reason: 'tooLarge' },
        scope: 'edit',
        hunks: [{ lines: [{ kind: 'removed' }, { kind: 'added' }] }],
      });
    });

    it('refuses a side that is not text — S-111', async () => {
      writeFileSync(file('config.json'), Buffer.from([0x7b, 0x00, 0x7d]));
      const socket = await connect();
      const sessionId = await started(socket);
      const [overConfig] = toolsNamed(await editTurn(socket, sessionId), 'Write');

      const refused = await get(
        `/sessions/${sessionId}/tools/${String(overConfig?.toolUseId)}/diff`,
      );

      expect([refused.status, refused.body.error.code]).toEqual([415, 'FILE_NOT_TEXT']);
    });

    it('logs the path and the sizes, never what the files say — S-112', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      const [overConfig] = toolsNamed(await editTurn(socket, sessionId), 'Write');

      await get(`/sessions/${sessionId}/tools/${String(overConfig?.toolUseId)}/diff`);
      await changeFile(sessionId, 'app.js');

      // The log is the whole suite's: only this session's lines are this test's.
      const lines = [
        ...harness.log.withOp('session.diff'),
        ...harness.log.withOp('session.changes'),
      ].filter((line) => line['sessionId'] === sessionId);
      expect(lines).toEqual([
        expect.objectContaining({ path: file('config.json'), afterLength: 16 }),
        expect.objectContaining({ path: file('app.js'), hunks: 2 }),
      ]);
      expect(JSON.stringify(lines)).not.toContain('true}');
      expect(JSON.stringify(lines)).not.toContain('greeting');
    });
  });

  describe('the changes of a session — B-26', () => {
    it('lists each file the session created or modified, with how many lines — S-113', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      await editTurn(socket, sessionId);

      const changes = await get(`/sessions/${sessionId}/changes`);

      expect(changes.status).toBe(200);
      expect(changes.body).toEqual({
        promptId: expect.any(String) as unknown,
        files: [
          expect.objectContaining({
            path: file('app.js'),
            kind: 'modified',
            added: 2,
            removed: 2,
            modifiedOutside: false,
          }),
          expect.objectContaining({
            path: file('config.json'),
            kind: 'modified',
            added: 1,
            removed: 1,
          }),
          expect.objectContaining({
            path: file('notes.txt'),
            kind: 'created',
            added: 1,
            removed: 0,
          }),
        ],
      });
    });

    it('marks a file edited by hand after the session — S-114', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      await editTurn(socket, sessionId);
      writeFileSync(file('app.js'), 'my own words\n', 'utf8');

      const changes = await get(`/sessions/${sessionId}/changes`);

      expect(changes.body.files[0]).toMatchObject({ path: file('app.js'), modifiedOutside: true });
    });

    it('is empty for a session that changed nothing — S-115', async () => {
      const socket = await connect();
      const sessionId = await started(socket);

      expect((await get(`/sessions/${sessionId}/changes`)).body).toEqual({
        promptId: null,
        files: [],
      });
    });

    it('reads one file whole, and refuses one the session did not change — S-116', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      await editTurn(socket, sessionId);

      const app = await changeFile(sessionId, 'app.js');
      expect(app).toMatchObject({
        kind: 'modified',
        before: { state: 'content', content: APP_BEFORE },
        now: { state: 'content', content: text('app.js') },
      });
      expect(app.hunks).toHaveLength(2);
      expect(app.revision).toMatch(/^[0-9a-f]{64}$/);

      const other = await get(
        `/sessions/${sessionId}/changes/file?path=${encodeURIComponent(file('untouched.md'))}`,
      );
      expect([other.status, other.body.error.code]).toEqual([404, 'NOT_FOUND']);
      const relative = await get(`/sessions/${sessionId}/changes/file?path=app.js`);
      expect(relative.status).toBe(400);
    });

    it('refuses a file that became a link to outside, without reading it — S-117', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      await editTurn(socket, sessionId);
      writeFileSync(path.join(root, 'secret.txt'), 'not yours\n', 'utf8');
      rmSync(file('notes.txt'));
      symlinkSync(path.join(root, 'secret.txt'), file('notes.txt'));

      const refused = await get(
        `/sessions/${sessionId}/changes/file?path=${encodeURIComponent(file('notes.txt'))}`,
      );

      expect([refused.status, refused.body.error.code]).toEqual([403, 'WORKSPACE_NOT_ALLOWED']);
      expect(JSON.stringify(refused.body)).not.toContain('not yours');
    });

    it('reads a file being rewritten as one whole version, never a mix — S-118', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      await editTurn(socket, sessionId);
      const versions = ['A\n'.repeat(200), 'B\n'.repeat(200)];

      // The folder of this test, held: the next test's `beforeEach` moves `workspace`.
      const target = file('config.json');
      const writes = (async () => {
        for (let round = 0; round < 40; round += 1) {
          await writeFile(`${target}.tmp`, versions[round % 2] ?? '', 'utf8');
          await rename(`${target}.tmp`, target);
        }
      })();
      const [settled] = await Promise.allSettled([
        Promise.all(Array.from({ length: 20 }, () => changeFile(sessionId, 'config.json'))),
        writes,
      ]);
      const reads = settled.status === 'fulfilled' ? settled.value : [];
      expect(settled.status).toBe('fulfilled');

      for (const read of reads) {
        expect([...versions, '{"debug": true}\n']).toContain(read.now.content);
      }
    });
  });

  describe('rejecting files — B-30', () => {
    it('puts back only the file asked for; the others stay — S-132', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      await editTurn(socket, sessionId);
      const config = await changeFile(sessionId, 'config.json');
      const { promptId } = (await get(`/sessions/${sessionId}/changes`)).body as {
        promptId: string;
      };

      const { outcome } = await answer(socket, 'session.rewindFiles', {
        sessionId,
        promptId,
        paths: [file('config.json')],
      });

      expect(outcome?.payload).toMatchObject({
        reverted: [{ path: file('config.json'), action: 'restored' }],
      });
      expect(text('config.json')).toBe(CONFIG_BEFORE);
      expect(text('app.js')).not.toBe(APP_BEFORE);
      expect(existsSync(file('notes.txt'))).toBe(true);
      expect(config.kind).toBe('modified');
    });

    it('preserves a file edited by hand, and writes nothing — S-133', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      await editTurn(socket, sessionId);
      writeFileSync(file('config.json'), 'mine\n', 'utf8');
      const { promptId } = (await get(`/sessions/${sessionId}/changes`)).body as {
        promptId: string;
      };

      const { outcome } = await answer(socket, 'session.rewindFiles', {
        sessionId,
        promptId,
        paths: [file('config.json')],
      });

      expect(outcome?.payload).toMatchObject({
        reverted: [],
        preserved: [{ path: file('config.json'), reason: 'modifiedOutside' }],
      });
      expect(text('config.json')).toBe('mine\n');
    });

    it('is refused while a turn runs — S-134', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      await editTurn(socket, sessionId);
      const { promptId } = (await get(`/sessions/${sessionId}/changes`)).body as {
        promptId: string;
      };
      socket.send(commandFrame('session.prompt', { sessionId, text: '[hold] keep going' }));
      for (;;) {
        const frame = await until(socket, 'session.statusChanged');
        if (frame.payload?.['status'] === 'thinking') {
          break;
        }
      }

      const { refusal } = await answer(socket, 'session.rewindFiles', {
        sessionId,
        promptId,
        paths: [file('config.json')],
      });

      expect(refusal?.payload).toMatchObject({ code: 'SESSION_LOCKED' });
      expect(text('config.json')).toBe('{"debug": true}\n');
      socket.send(commandFrame('session.interrupt', { sessionId }));
      await until(socket, 'turn.completed');
    });

    it('answers a second rejection of the same file with unchanged — S-135', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      await editTurn(socket, sessionId);
      const { promptId } = (await get(`/sessions/${sessionId}/changes`)).body as {
        promptId: string;
      };
      const asked = { sessionId, promptId, paths: [file('config.json')] };

      await answer(socket, 'session.rewindFiles', asked);
      const { outcome } = await answer(socket, 'session.rewindFiles', asked);

      expect(outcome?.payload).toMatchObject({
        reverted: [],
        unchanged: [{ path: file('config.json') }],
      });
    });

    it('refuses a file the point does not reach — S-136', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      await editTurn(socket, sessionId);
      const { promptId } = (await get(`/sessions/${sessionId}/changes`)).body as {
        promptId: string;
      };

      const { refusal } = await answer(socket, 'session.rewindFiles', {
        sessionId,
        promptId,
        paths: [file('untouched.md')],
      });

      expect(refusal?.payload).toMatchObject({
        code: 'INVALID_INPUT',
        messageKey: 'session.error.rewindPathUnknown',
      });
    });
  });

  describe('rejecting one hunk, and undoing it — B-31', () => {
    it('puts back only that hunk, enters the trail first, and can be undone — S-138, S-142, S-143', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      await editTurn(socket, sessionId);
      const edited = text('app.js');
      const app = await changeFile(sessionId, 'app.js');

      const { outcome } = await answer(socket, 'session.rejectChange', {
        sessionId,
        path: file('app.js'),
        hunkId: app.hunks[0]?.id,
        revision: app.revision,
      });

      expect(outcome?.payload).toMatchObject({
        reverted: [{ path: file('app.js'), action: 'restored' }],
        hunkId: app.hunks[0]?.id,
      });
      expect(text('app.js')).toContain("'hello'");
      expect(text('app.js')).toContain('console.info');

      const rows = await db().execute<{ details: Record<string, unknown> }>(
        sql`SELECT "details" FROM "audit_events" WHERE "kind" = 'session.filesRewound'
            AND "details"->>'sessionId' = ${sessionId}`,
      );
      expect(rows.rows.map((row) => row.details['rejected'])).toEqual([
        { path: file('app.js'), hunkId: app.hunks[0]?.id },
      ]);

      const undone = await answer(socket, 'session.restoreChange', {
        sessionId,
        path: file('app.js'),
      });
      expect(undone.outcome?.payload).toMatchObject({
        reverted: [{ path: file('app.js'), action: 'restored' }],
      });
      expect(text('app.js')).toBe(edited);
    });

    it('refuses a hunk computed against a disk that changed — S-139', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      await editTurn(socket, sessionId);
      const app = await changeFile(sessionId, 'app.js');
      writeFileSync(file('app.js'), `${text('app.js')}// more\n`, 'utf8');

      const { refusal } = await answer(socket, 'session.rejectChange', {
        sessionId,
        path: file('app.js'),
        hunkId: app.hunks[0]?.id,
        revision: app.revision,
      });

      expect(refusal?.payload).toMatchObject({
        code: 'SESSION_CHANGE_STALE',
        params: { path: file('app.js') },
      });
    });

    it('removes a file the session created when its last hunk goes — S-141', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      await editTurn(socket, sessionId);
      const notes = await changeFile(sessionId, 'notes.txt');

      const { outcome } = await answer(socket, 'session.rejectChange', {
        sessionId,
        path: file('notes.txt'),
        hunkId: notes.hunks[0]?.id,
        revision: notes.revision,
      });

      expect(outcome?.payload).toMatchObject({
        reverted: [{ path: file('notes.txt'), action: 'deleted' }],
      });
      expect(existsSync(file('notes.txt'))).toBe(false);
    });

    it('cannot undo once the file changed again, nor twice — S-142', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      await editTurn(socket, sessionId);
      const config = await changeFile(sessionId, 'config.json');
      await answer(socket, 'session.rejectChange', {
        sessionId,
        path: file('config.json'),
        hunkId: config.hunks[0]?.id,
        revision: config.revision,
      });
      writeFileSync(file('config.json'), 'changed again\n', 'utf8');

      const stale = await answer(socket, 'session.restoreChange', {
        sessionId,
        path: file('config.json'),
      });
      expect(stale.refusal?.payload).toMatchObject({ code: 'SESSION_CHANGE_STALE' });

      const none = await answer(socket, 'session.restoreChange', {
        sessionId,
        path: file('app.js'),
      });
      expect(none.refusal?.payload).toMatchObject({
        code: 'NOT_FOUND',
        messageKey: 'session.error.changeNotFound',
      });
    });

    it('writes once when the same hunk is sent again — S-144', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      await editTurn(socket, sessionId);
      const app = await changeFile(sessionId, 'app.js');
      const asked = {
        sessionId,
        path: file('app.js'),
        hunkId: app.hunks[1]?.id,
        revision: app.revision,
      };

      await answer(socket, 'session.rejectChange', asked);
      const once = text('app.js');
      const { outcome } = await answer(socket, 'session.rejectChange', asked);

      expect(outcome?.payload).toMatchObject({
        reverted: [],
        unchanged: [{ path: file('app.js') }],
      });
      expect(text('app.js')).toBe(once);
      const rows = await db().execute(
        sql`SELECT 1 FROM "audit_events" WHERE "kind" = 'session.filesRewound'
            AND "details"->>'sessionId' = ${sessionId}`,
      );
      expect(rows.rows).toHaveLength(1);
    });
  });
});
