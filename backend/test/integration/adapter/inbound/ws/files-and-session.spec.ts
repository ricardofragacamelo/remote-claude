import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Envelope } from '@remote-claude/contracts';

import { ClaudeWrites } from '@application/files';
import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import type { QueryFactory } from '@adapter/outbound/claude/query.factory';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptOptions } from '../../../../fakes/agent-sdk/scripted-query';
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

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

/**
 * The person's writes and a live session of Claude, on the same file — plan 07, B-18.
 *
 * The session writes through the scripted CLI, exactly where the recording says the real one
 * wrote; the person saves through `PUT /files/content`; the undo goes over a real socket. Nothing
 * in `session` changed for the first scenario, and that is the point of proving it: the person's
 * save is "somebody else's edit" to the undo, which preserves it.
 */
describe('the files of a folder and the session working in it', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  let token: string;
  let workspace: string;
  let script: ScriptOptions;
  const open: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = realpathSync(allowlist.root);
    const createQuery: QueryFactory = (params) => scriptedSdk(script).createQuery(params);

    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(createQuery),
      allowlist,
      { RC_PERMISSION_TIMEOUT_MS: '5000' },
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
    script = { fixture: 'text-turn', performWritesIn: workspace };
  });

  const summary = (): string => path.join(workspace, 'summary.md');

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

  async function until(socket: TestSocket, type: string): Promise<Envelope> {
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

      if (frame.type === type) {
        return frame;
      }
    }

    throw new Error(`no ${type}`);
  }

  /** A session that ran the writing turn, and its first undo point. */
  async function sessionThatWrote(): Promise<{
    socket: TestSocket;
    sessionId: string;
    promptId: string;
  }> {
    const socket = await connect();
    socket.send(commandFrame('session.start', { workspacePath: workspace }));
    const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);

    socket.send(commandFrame('session.prompt', { sessionId, text: WRITING_TURN }));
    await until(socket, 'turn.completed');

    const points = await request(harness.app.getHttpServer())
      .get(`/sessions/${sessionId}/checkpoints`)
      .set('authorization', `Bearer ${token}`);
    const promptId = String(
      (points.body as { checkpoints: { promptId: string }[] }).checkpoints[0]?.promptId,
    );

    return { socket, sessionId, promptId };
  }

  it("keeps the person's save when the turn that wrote the file is undone — S-124", async () => {
    const { socket, sessionId, promptId } = await sessionThatWrote();
    expect(readFileSync(summary(), 'utf8')).toBe(WRITTEN);

    const saved = await request(harness.app.getHttpServer())
      .put('/files/content')
      .set('authorization', `Bearer ${token}`)
      .set('if-match', `"${sha256(WRITTEN)}"`)
      .send({ folder: workspace, path: 'summary.md', content: 'edited by the person\n' });
    expect(saved.status).toBe(200);

    socket.send(commandFrame('session.rewindFiles', { sessionId, promptId }));
    const rewound = await until(socket, 'session.rewound');

    expect(rewound.payload).toMatchObject({
      reverted: [],
      preserved: [{ path: summary(), reason: 'modifiedOutside' }],
    });
    expect(readFileSync(summary(), 'utf8')).toBe('edited by the person\n');
  });

  it("hears of Claude's write on the bus, without importing the session — S-126", async () => {
    await sessionThatWrote();

    expect(harness.app.get(ClaudeWrites).wrote(summary(), sha256(WRITTEN), new Date())).toBe(true);
  });
});
