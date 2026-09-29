import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import { SessionRegistry } from '@application/session';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { scriptedSdk } from '../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../support/containers/postgres';
import { startIdentityServer } from '../../../support/identity/identity-server';
import type { IdentityServer } from '../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../support/app/test-app';
import type { TestAllowlist, TestApp } from '../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../support/app/ws-client';

/**
 * `SIGHUP` reloads the workspace allowlist of a running backend, and does nothing else — plan 06,
 * B-11 and D-15.
 *
 * The signal is delivered with `process.emit`, which runs exactly the listeners the process has:
 * ours, and — were Nest's shutdown hook still listening to it — the one that closes the
 * application and re-raises the signal, which is what S-180 rules out.
 */
describe('reloading the allowlist on SIGHUP', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let allowlist: TestAllowlist;
  let token: string;
  let root: string;
  let other: string;
  /** The `SIGHUP` listeners the process had before the application came up. */
  let before: readonly unknown[];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    allowlist = writeTestAllowlist([SUBJECT]);
    root = realpathSync(allowlist.root);
    other = path.join(path.dirname(root), 'other');
    mkdirSync(path.join(root, 'app'));
    mkdirSync(path.join(other, 'project'), { recursive: true });

    // The suite's own tooling listens too (testcontainers brings `signal-exit`, which stands aside
    // whenever anybody else listens); what is asserted is what the application added.
    before = process.listeners('SIGHUP');
    harness = await startTestApp(
      database.url,
      identity,
      (builder) =>
        builder
          .overrideProvider(QUERY_FACTORY)
          .useValue(scriptedSdk({ fixture: 'text-turn' }).createQuery),
      allowlist,
    );
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(async () => {
    declare([root]);
    process.emit('SIGHUP', 'SIGHUP');
    await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute(sql`TRUNCATE TABLE "workspace_folders"`);
  });

  /** Rewrites the allowlist file with these roots, all for the suite's subject. */
  function declare(roots: readonly string[]): void {
    writeFileSync(
      allowlist.file,
      `roots:\n${roots
        .map(
          (entry) =>
            `  - path: ${entry}\n    label: ${path.basename(entry)}\n    users: [${SUBJECT}]\n`,
        )
        .join('')}`,
      'utf8',
    );
  }

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const authorised = { authorization: '' };
  const list = (target: string) =>
    http()
      .get('/workspaces/directories')
      .query({ path: target })
      .set({ ...authorised, authorization: `Bearer ${token}` });
  const open = (target: string) =>
    http()
      .post('/workspaces/open-folders')
      .send({ path: target })
      .set({ authorization: `Bearer ${token}` });

  it('says at boot which file it is running with — S-61', () => {
    expect(harness.log.withOp('allowlist.loaded')[0]).toMatchObject({
      file: allowlist.file,
      roots: [root],
    });
  });

  it('lists and opens a root added to the file, without restarting — S-62', async () => {
    expect((await list(other)).status).toBe(403);

    declare([root, other]);
    process.emit('SIGHUP', 'SIGHUP');

    expect((await list(other)).status).toBe(200);
    expect((await open(path.join(other, 'project'))).status).toBe(201);
    expect(harness.log.withOp('allowlist.reloaded').at(-1)).toMatchObject({
      level: 'info',
      file: allowlist.file,
      added: [other],
      removed: [],
    });
  });

  it('refuses the next listing once a root left the file — S-32', async () => {
    expect((await list(root)).status).toBe(200);

    declare([other]);
    process.emit('SIGHUP', 'SIGHUP');

    const refused = await list(root);
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('WORKSPACE_NOT_ALLOWED');
  });

  it('marks a tab whose folder left the allowlist, and keeps the others — S-47', async () => {
    declare([root, other]);
    process.emit('SIGHUP', 'SIGHUP');
    await open(path.join(root, 'app'));
    await open(path.join(other, 'project'));

    declare([root]);
    process.emit('SIGHUP', 'SIGHUP');

    const tabs = await http()
      .get('/workspaces/open-folders')
      .set({ authorization: `Bearer ${token}` });
    expect(tabs.body.folders).toEqual([
      { path: path.join(root, 'app'), rootLabel: path.basename(root), state: 'available' },
      { path: path.join(other, 'project'), rootLabel: null, state: 'notAllowed' },
    ]);
  });

  it('keeps the previous list when the file is invalid, and says why — S-63', async () => {
    writeFileSync(allowlist.file, 'roots: []\n', 'utf8');
    process.emit('SIGHUP', 'SIGHUP');

    expect((await list(root)).status).toBe(200);
    expect(harness.log.withOp('allowlist.reloaded').at(-1)).toMatchObject({
      level: 'error',
      file: allowlist.file,
      problems: [expect.stringContaining('roots')],
    });
  });

  it('changes nothing when the file is saved and no signal comes — there is no watch — S-179', async () => {
    declare([other]);

    expect((await list(root)).status).toBe(200);
  });

  describe('with a session and a socket open', () => {
    let socket: TestSocket;

    beforeEach(async () => {
      socket = await TestSocket.open(harness.url);
      socket.send(
        commandFrame('connection.authenticate', {
          token,
          locale: 'en',
          client: { kind: 'web', version: '0.0.0' },
        }),
      );
      await socket.next();
    });

    it('leaves a live session in a removed root alone, and refuses the next one — S-64', async () => {
      socket.send(commandFrame('session.start', { workspacePath: root }));
      const started = await until(socket, 'session.started');
      const registry = harness.app.get(SessionRegistry);

      declare([other]);
      process.emit('SIGHUP', 'SIGHUP');

      expect(registry.size).toBe(1);
      socket.send(commandFrame('session.start', { workspacePath: root }));
      expect((await until(socket, 'error')).payload).toMatchObject({
        code: 'WORKSPACE_NOT_ALLOWED',
      });
      expect((await open(path.join(root, 'app'))).status).toBe(403);

      socket.send(
        commandFrame('session.close', { sessionId: String(started.payload?.['sessionId']) }),
      );
      await until(socket, 'session.closed');
      socket.close();
    });

    it('keeps the process, its socket and its routes up through the signal — S-180', async () => {
      // The application added one listener for the signal — ours. Nest's shutdown hook is not it.
      const added = process.listeners('SIGHUP').filter((listener) => !before.includes(listener));
      expect(added).toHaveLength(1);

      process.emit('SIGHUP', 'SIGHUP');

      expect(socket.isOpen).toBe(true);
      expect((await http().get('/health')).status).toBe(200);
      socket.close();
    });
  });
});

/** Reads frames until one of `type` arrives. */
async function until(socket: TestSocket, type: string, limit = 200): Promise<Envelope> {
  for (let taken = 0; taken < limit; taken += 1) {
    const frame = await socket.next();

    if (frame.type === type) {
      return frame;
    }
  }

  throw new Error(`no ${type} in ${String(limit)} frames`);
}
