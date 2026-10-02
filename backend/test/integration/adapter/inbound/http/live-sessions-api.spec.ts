import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import type { QueryFactory } from '@adapter/outbound/claude/query.factory';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT } from '../../../../support/app/test-app';
import type { TestAllowlist, TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

const OTHER = 'auth|other';

/** Two roots — one shared by both people, one of the other person alone — and a place outside. */
function allowlistOfTwo(): TestAllowlist & { readonly theirs: string; readonly outside: string } {
  const directory = mkdtempSync(path.join(tmpdir(), 'rc-live-'));
  const root = path.join(directory, 'shared');
  const theirs = path.join(directory, 'theirs');
  const outside = path.join(directory, 'outside');
  const file = path.join(directory, 'allowlist.yaml');

  for (const folder of [root, theirs, outside]) {
    mkdirSync(folder);
  }
  writeFileSync(
    file,
    `roots:\n  - path: ${root}\n    label: Shared\n    users:\n      - ${SUBJECT}\n      - ${OTHER}\n` +
      `  - path: ${theirs}\n    label: Theirs\n    users:\n      - ${OTHER}\n`,
    'utf8',
  );

  return { file, root, theirs, outside };
}

interface LiveSessionRow {
  readonly sessionId: string;
  readonly claudeSessionId: string;
  readonly workspacePath: string;
  readonly status: string;
  readonly model: string;
  readonly permissionMode: string;
  readonly startedAt: string;
  readonly openedFrom: string;
  readonly pendingPermissions: number;
}

/**
 * `GET /sessions?workspacePath=` — the live sessions of a folder, over the real application (plan
 * 08, B-07). Sessions are opened the way a client opens them, on a real socket; the CLI is the
 * recorded one, silent, so every session stays alive until the test closes it.
 */
describe('the live sessions of a folder', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let allowlist: ReturnType<typeof allowlistOfTwo>;
  let mine: string;
  let theirs: string;

  const open: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    allowlist = allowlistOfTwo();

    const createQuery: QueryFactory = (params) => scriptedSdk({ silent: true }).createQuery(params);

    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(createQuery),
      allowlist,
      { RC_SESSION_MAX_CONCURRENT: '32' },
    );
    mine = await identity.accessToken({ subject: SUBJECT });
    theirs = await identity.accessToken({ subject: OTHER });
  });

  afterAll(async () => {
    for (const socket of open) {
      socket.close();
    }
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  async function connect(token: string): Promise<TestSocket> {
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
    for (let taken = 0; taken < 200; taken += 1) {
      const frame = await socket.next();
      if (frame.type === type) {
        return frame;
      }
    }
    throw new Error(`no ${type}`);
  }

  async function start(socket: TestSocket, workspacePath: string): Promise<string> {
    socket.send(commandFrame('session.start', { workspacePath }));
    return String((await until(socket, 'session.started')).payload?.['sessionId']);
  }

  function folder(name: string): string {
    const directory = path.join(allowlist.root, name);
    mkdirSync(directory, { recursive: true });
    return directory;
  }

  const list = (workspacePath: string | null, token: string = mine): request.Test => {
    const call = request(harness.app.getHttpServer()).get('/sessions');
    return (workspacePath === null ? call : call.query({ workspacePath })).set(
      'authorization',
      `Bearer ${token}`,
    );
  };

  const rows = async (workspacePath: string, token: string = mine): Promise<LiveSessionRow[]> => {
    const response = await list(workspacePath, token);
    expect(response.status).toBe(200);
    return (response.body as { sessions: LiveSessionRow[] }).sessions;
  };

  it('lists the caller’s live sessions of the folder and below it, with what a row shows — S-13', async () => {
    const repo = folder('s13');
    const socket = await connect(mine);
    const top = await start(socket, repo);
    const below = await start(socket, folder('s13/backend'));

    const listed = await rows(repo);

    expect(listed.map((row) => row.sessionId).sort()).toEqual([top, below].sort());
    expect(listed.find((row) => row.sessionId === top)).toMatchObject({
      workspacePath: repo,
      status: 'idle',
      permissionMode: 'default',
      openedFrom: 'web',
      pendingPermissions: 0,
      claudeSessionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      startedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it('does not list somebody else’s session in the same folder, not even as a count — S-14', async () => {
    const repo = folder('s14');
    await start(await connect(theirs), repo);

    expect(await rows(repo)).toEqual([]);
    expect(await rows(repo, theirs)).toHaveLength(1);
  });

  it('answers 200 with an empty list for a folder where nothing runs — S-17', async () => {
    expect(await rows(folder('s17'))).toEqual([]);
  });

  it.each([
    ['no folder', null],
    ['a relative folder', 'shared/s18'],
  ])('refuses %s with INVALID_INPUT — S-18', async (_case, workspacePath) => {
    const response = await list(workspacePath);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
  });

  it('refuses a folder outside every root, and a root of somebody else — S-19', async () => {
    const outside = await list(allowlist.outside);
    const ofSomebodyElse = await list(allowlist.theirs);

    expect([outside.status, outside.body.error.code]).toEqual([403, 'WORKSPACE_NOT_ALLOWED']);
    expect([ofSomebodyElse.status, ofSomebodyElse.body.error.code]).toEqual([403, 'FORBIDDEN']);
  });

  it('refuses a folder that does not exist, and one that is a file — S-20', async () => {
    const file = path.join(folder('s20'), 'notes.md');
    writeFileSync(file, 'x', 'utf8');

    const missing = await list(path.join(allowlist.root, 's20', 'gone'));
    const notAFolder = await list(file);

    expect([missing.status, missing.body.error.code]).toEqual([404, 'WORKSPACE_NOT_FOUND']);
    expect([notAFolder.status, notAFolder.body.error.code]).toEqual([
      422,
      'WORKSPACE_NOT_A_DIRECTORY',
    ]);
  });

  it('compares real paths: through a link inside it lists once, through one that escapes it refuses — S-21', async () => {
    const real = folder('s21/real');
    const inside = path.join(allowlist.root, 's21', 'link');
    const escaping = path.join(allowlist.root, 's21', 'escape');
    symlinkSync(real, inside);
    symlinkSync(allowlist.outside, escaping);

    const sessionId = await start(await connect(mine), inside);

    expect((await rows(real)).map((row) => row.sessionId)).toEqual([sessionId]);
    expect((await rows(inside)).map((row) => row.sessionId)).toEqual([sessionId]);
    expect((await rows(inside))[0]?.workspacePath).toBe(real);
    expect((await list(escaping)).body.error.code).toBe('WORKSPACE_NOT_ALLOWED');
  });

  it('follows the registry: a session that closes leaves, one that opens arrives — S-22', async () => {
    const repo = folder('s22');
    const socket = await connect(mine);
    const first = await start(socket, repo);

    socket.send(commandFrame('session.close', { sessionId: first }));
    await until(socket, 'session.closed');
    const second = await start(socket, repo);

    expect((await rows(repo)).map((row) => row.sessionId)).toEqual([second]);
  });

  it('logs the folder and the count at the edge, and nothing a session said — S-24', async () => {
    const repo = folder('s24');
    await start(await connect(mine), repo);
    harness.log.lines.length = 0;

    await rows(repo);

    const line = harness.log.lines.find((entry) => entry['op'] === 'session.list');
    expect(line).toMatchObject({ level: 'debug', workspacePath: repo, count: 1 });
    expect(Object.keys(line ?? {})).not.toContain('summary');
    expect(Object.keys(line ?? {})).not.toContain('prompt');
  });
});
