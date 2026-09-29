import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync } from 'node:fs';
import { chmod, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import { SessionRegistry } from '@application/session';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/**
 * The folder routes of the workspace module — listing, recent folders and folder tabs — against the
 * real application: the real guard, pipe, filter and container, a real PostgreSQL and a real
 * directory tree (plan 06, B-06…B-09).
 */
describe('the folder routes of the workspace module', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;
  let strangerToken: string;
  let root: string;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = await realpath(allowlist.root);

    await mkdir(path.join(root, 'app', 'src'), { recursive: true });
    await mkdir(path.join(root, 'app', 'docs'), { recursive: true });
    await mkdir(path.join(root, 'app', '.cache'), { recursive: true });
    await mkdir(path.join(root, 'empty'));
    await mkdir(path.join(root, '..', 'outside'), { recursive: true });
    await writeFile(path.join(root, 'app', 'readme.md'), 'x', 'utf8');
    await symlink(path.join(root, 'app'), path.join(root, 'inward'));
    await symlink(path.join(root, '..', 'outside'), path.join(root, 'escape'));
    for (let index = 0; index < 8; index += 1) {
      await mkdir(path.join(root, 'tabs', `t${String(index)}`), { recursive: true });
    }
    for (let index = 0; index < 22; index += 1) {
      await mkdir(path.join(root, 'recent', `r${String(index).padStart(2, '0')}`), {
        recursive: true,
      });
    }
    // One past the ceiling, and one more: the listing is cut, and `prefix` reaches what it cut.
    mkdirSync(path.join(root, 'many'));
    for (let index = 0; index < 1002; index += 1) {
      mkdirSync(path.join(root, 'many', `entry${String(index)}`));
    }

    const scripted = scriptedSdk({ fixture: 'text-turn' });
    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
    );
    token = await identity.accessToken({ subject: SUBJECT });
    strangerToken = await identity.accessToken({ subject: 'auth|stranger' });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(async () => {
    await db().execute(sql`TRUNCATE TABLE "workspace_folders"`);
  });

  const db = (): PersistenceContext['db'] =>
    harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT).db;

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const as = (bearer: string) => ({ authorization: `Bearer ${bearer}` });

  const list = (target: string, extra: Record<string, string> = {}) =>
    http()
      .get('/workspaces/directories')
      .query({ path: target, ...extra })
      .set(as(token));

  const open = (target: string, bearer: string = token) =>
    http().post('/workspaces/open-folders').send({ path: target }).set(as(bearer));
  const close = (target: string) =>
    http().delete('/workspaces/open-folders').query({ path: target }).set(as(token));
  const recent = (bearer: string = token) => http().get('/workspaces/recent').set(as(bearer));
  const tabs = () => http().get('/workspaces/open-folders').set(as(token));

  async function rowCount(): Promise<number> {
    const result = await db().execute<{ count: string }>(
      sql`SELECT count(*) AS count FROM "workspace_folders"`,
    );
    return Number(result.rows[0]?.count);
  }

  describe('GET /workspaces/directories', () => {
    it('lists the subdirectories of one level, in order, and never a file — S-08, S-09', async () => {
      const response = await list(path.join(root, 'app'));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        path: path.join(root, 'app'),
        root: { path: root, label: 'Suite', lastUsedAt: null },
        parent: root,
        entries: [
          { name: 'docs', path: path.join(root, 'app', 'docs'), hidden: false, symlink: false },
          { name: 'src', path: path.join(root, 'app', 'src'), hidden: false, symlink: false },
        ],
        truncated: false,
      });
    });

    it('answers no entry and untruncated for a folder with no subfolder — S-10', async () => {
      const response = await list(path.join(root, 'empty'));

      expect(response.body).toMatchObject({ entries: [], truncated: false });
    });

    it('lists hidden folders only when asked — S-14', async () => {
      const shown = await list(path.join(root, 'app'), { hidden: 'true' });

      expect(shown.body.entries.map((entry: { name: string }) => entry.name)).toEqual([
        '.cache',
        'docs',
        'src',
      ]);
      expect(shown.body.entries[0]).toMatchObject({ hidden: true });
    });

    it('cuts at the ceiling, and a prefix reaches what it cut — S-11, S-13', async () => {
      const cut = await list(path.join(root, 'many'));
      const listed = new Set(cut.body.entries.map((entry: { name: string }) => entry.name));
      const missing = Array.from({ length: 1002 }, (_, index) => `entry${String(index)}`).find(
        (name) => !listed.has(name),
      );

      expect(cut.body.truncated).toBe(true);
      expect(cut.body.entries).toHaveLength(1000);

      const reached = await list(path.join(root, 'many'), { prefix: String(missing) });

      expect(reached.body.entries.map((entry: { name: string }) => entry.name)).toContain(missing);
    });

    it('lists a link into the root, marked, and lists through it — S-15', async () => {
      const top = await list(root);
      const inward = top.body.entries.find((entry: { name: string }) => entry.name === 'inward');

      expect(inward).toEqual({
        name: 'inward',
        path: path.join(root, 'inward'),
        hidden: false,
        symlink: true,
      });

      const through = await list(path.join(root, 'inward'));

      expect(through.status).toBe(200);
      expect(through.body.path).toBe(path.join(root, 'app'));
    });

    it('omits a link that leaves the root — S-16', async () => {
      const top = await list(root);

      expect(top.body.entries.map((entry: { name: string }) => entry.name)).not.toContain('escape');
    });

    it('answers a null parent at the root — S-18', async () => {
      expect((await list(root)).body.parent).toBeNull();
    });

    it('answers the same listing twice, in the same order — S-30', async () => {
      const first = await list(root);
      const second = await list(root);

      expect(second.body).toEqual(first.body);
    });

    it.each([
      ['outside every root', '/etc', 403, 'WORKSPACE_NOT_ALLOWED'],
      ['that does not exist', 'gone', 404, 'WORKSPACE_NOT_FOUND'],
      ['that is a file', 'app/readme.md', 422, 'WORKSPACE_NOT_A_DIRECTORY'],
      ['that is a link out of the root', 'escape', 403, 'WORKSPACE_NOT_ALLOWED'],
    ])('refuses a path %s — S-20, S-22, S-23, S-24', async (_case, target, status, code) => {
      const response = await list(target.startsWith('/') ? target : path.join(root, target));

      expect(response.status).toBe(status);
      expect(response.body.error.code).toBe(code);
    });

    it('refuses a root of somebody else — S-21', async () => {
      const response = await http()
        .get('/workspaces/directories')
        .query({ path: root })
        .set(as(strangerToken));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('refuses a directory this process may not read — S-25', async () => {
      const locked = path.join(root, 'locked');
      await mkdir(locked);
      await chmod(locked, 0o000);

      try {
        const response = await list(locked);

        expect(response.status).toBe(422);
        expect(response.body.error).toMatchObject({
          code: 'WORKSPACE_DIRECTORY_UNREADABLE',
          messageKey: 'workspace.error.directoryUnreadable',
        });
      } finally {
        await chmod(locked, 0o755);
        await rm(locked, { recursive: true });
      }
    });

    it.each([
      ['a relative path', { path: 'app' }],
      ['a climbing path', { path: '/srv/../etc' }],
      ['a flag that is not a word', { path: '/srv', hidden: 'yes' }],
      ['a prefix that is a path', { path: '/srv', prefix: 'a/b' }],
    ])('answers 400 for %s', async (_case, query) => {
      const response = await http().get('/workspaces/directories').query(query).set(as(token));

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('answers 401 without a credential — S-27', async () => {
      const response = await http().get('/workspaces/directories').query({ path: root });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('the recent folders', () => {
    it('records a folder when it is opened, only for its user — S-34, S-36', async () => {
      await open(path.join(root, 'app'));

      const mine = await recent();

      expect(mine.status).toBe(200);
      expect(mine.body.folders).toEqual([
        {
          path: path.join(root, 'app'),
          rootLabel: 'Suite',
          lastOpenedAt: expect.any(String),
          pinned: false,
          available: true,
        },
      ]);
      expect((await recent(strangerToken)).body).toEqual({ folders: [] });
    });

    it('keeps one record of a folder opened twice, at the later instant — S-35', async () => {
      await open(path.join(root, 'app'));
      const first = (await recent()).body.folders[0].lastOpenedAt as string;
      await close(path.join(root, 'app'));
      await open(path.join(root, 'app'));

      const folders = (await recent()).body.folders;

      expect(folders).toHaveLength(1);
      expect(Date.parse(folders[0].lastOpenedAt)).toBeGreaterThanOrEqual(Date.parse(first));
      expect(await rowCount()).toBe(1);
    });

    it('marks a folder that left the disk instead of dropping it — S-37', async () => {
      const doomed = path.join(root, 'doomed');
      await mkdir(doomed);
      await open(doomed);
      await rm(doomed, { recursive: true });

      expect((await recent()).body.folders).toEqual([
        expect.objectContaining({ path: doomed, available: false }),
      ]);
    });

    it('lets the oldest unpinned go past twenty, and never a pinned one — S-38', async () => {
      const folder = (index: number) =>
        path.join(root, 'recent', `r${String(index).padStart(2, '0')}`);

      await open(folder(0));
      await http()
        .put('/workspaces/recent/pin')
        .send({ path: folder(0), pinned: true })
        .set(as(token));
      await close(folder(0));

      for (let index = 1; index <= 21; index += 1) {
        await open(folder(index));
        await close(folder(index));
      }

      const paths = (await recent()).body.folders.map((f: { path: string }) => f.path);

      expect(paths).toHaveLength(21);
      expect(paths[0]).toBe(folder(0));
      expect(paths).not.toContain(folder(1));
      expect(paths).toContain(folder(2));
    });

    it('pins and unpins, and pinning twice changes nothing — S-39', async () => {
      await open(path.join(root, 'app'));
      const pin = (pinned: boolean) =>
        http()
          .put('/workspaces/recent/pin')
          .send({ path: path.join(root, 'app'), pinned })
          .set(as(token));

      expect((await pin(true)).status).toBe(204);
      expect((await pin(true)).status).toBe(204);
      expect((await recent()).body.folders[0].pinned).toBe(true);

      expect((await pin(false)).status).toBe(204);
      expect((await recent()).body.folders[0].pinned).toBe(false);
    });

    it('forgets a folder, and answers 204 for one that is not there — S-40', async () => {
      await open(path.join(root, 'app'));
      await close(path.join(root, 'app'));
      const forget = () =>
        http()
          .delete('/workspaces/recent')
          .query({ path: path.join(root, 'app') })
          .set(as(token));

      expect((await forget()).status).toBe(204);
      expect((await recent()).body.folders).toEqual([]);
      expect((await forget()).status).toBe(204);
    });

    it('answers 401 without a credential', async () => {
      expect((await http().get('/workspaces/recent')).status).toBe(401);
    });
  });

  describe('the folder tabs', () => {
    it('opens with 201, and answers the open tab with 200 without a second one — S-41', async () => {
      const first = await open(path.join(root, 'app'));
      const second = await open(path.join(root, 'app'));

      expect(first.status).toBe(201);
      expect(first.body).toEqual({
        path: path.join(root, 'app'),
        rootLabel: 'Suite',
        state: 'available',
      });
      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
      expect((await tabs()).body.folders).toHaveLength(1);
    });

    it('opens the real path of a link', async () => {
      expect((await open(path.join(root, 'inward'))).body.path).toBe(path.join(root, 'app'));
    });

    it('answers 204 closing a tab that is not open — S-42', async () => {
      expect((await close(path.join(root, 'app'))).status).toBe(204);
    });

    it('refuses a ninth tab, saying the ceiling — S-43', async () => {
      for (let index = 0; index < 8; index += 1) {
        expect((await open(path.join(root, 'tabs', `t${String(index)}`))).status).toBe(201);
      }

      const refused = await open(path.join(root, 'app'));

      expect(refused.status).toBe(409);
      expect(refused.body.error).toMatchObject({
        code: 'OPEN_FOLDERS_LIMIT_REACHED',
        params: { limit: 8 },
      });
    });

    it('reorders the open set, and refuses any other — S-44', async () => {
      const a = path.join(root, 'tabs', 't0');
      const b = path.join(root, 'tabs', 't1');
      await open(a);
      await open(b);
      const reorder = (paths: string[]) =>
        http().put('/workspaces/open-folders/order').send({ paths }).set(as(token));

      const conflict = await reorder([a]);
      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe('CONFLICT');

      expect((await reorder([b, a])).status).toBe(204);
      expect((await tabs()).body.folders.map((f: { path: string }) => f.path)).toEqual([b, a]);
    });

    it('records nothing for a folder outside the allowlist — S-45', async () => {
      const refused = await open('/etc');

      expect(refused.status).toBe(403);
      expect((await recent()).body.folders).toEqual([]);
      expect((await tabs()).body.folders).toEqual([]);
    });

    it('keeps one record of a folder opened from two windows at once — S-46', async () => {
      const responses = await Promise.all([
        open(path.join(root, 'app')),
        open(path.join(root, 'app')),
        open(path.join(root, 'app')),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 201]);
      expect(await rowCount()).toBe(1);
    });

    it('lets two windows opening different folders at the ceiling pass it by none — S-43', async () => {
      for (let index = 0; index < 7; index += 1) {
        await open(path.join(root, 'tabs', `t${String(index)}`));
      }

      const racing = await Promise.all([
        open(path.join(root, 'tabs', 't7')),
        open(path.join(root, 'app')),
      ]);

      expect(racing.map((response) => response.status).sort()).toEqual([201, 409]);
      expect((await tabs()).body.folders).toHaveLength(8);
    });

    it('marks a tab whose folder left the disk — S-47', async () => {
      const doomed = path.join(root, 'doomed-tab');
      await mkdir(doomed);
      await open(path.join(root, 'app'));
      await open(doomed);
      await rm(doomed, { recursive: true });

      expect((await tabs()).body.folders).toEqual([
        { path: path.join(root, 'app'), rootLabel: 'Suite', state: 'available' },
        { path: doomed, rootLabel: 'Suite', state: 'missing' },
      ]);
    });

    it('does not pretend to have opened when the database refuses the write — S-48', async () => {
      await db().execute(
        sql`ALTER TABLE "workspace_folders" ADD CONSTRAINT "sabotage" CHECK (false) NOT VALID`,
      );

      try {
        const response = await open(path.join(root, 'app'));

        expect(response.status).toBe(500);
        expect(response.body.error.code).toBe('INTERNAL_ERROR');
      } finally {
        await db().execute(sql`ALTER TABLE "workspace_folders" DROP CONSTRAINT "sabotage"`);
      }

      expect(await rowCount()).toBe(0);
    });

    it('closes a tab without ending the session of Claude running in it — S-49', async () => {
      const folder = path.join(root, 'app');
      await open(folder);
      const socket = await TestSocket.open(harness.url);

      try {
        socket.send(
          commandFrame('connection.authenticate', {
            token,
            locale: 'en',
            client: { kind: 'web', version: '0.0.0' },
          }),
        );
        await socket.next();
        socket.send(commandFrame('session.start', { workspacePath: folder }));
        await until(socket, 'session.started');
        const registry = harness.app.get(SessionRegistry);

        expect(registry.size).toBe(1);
        expect((await close(folder)).status).toBe(204);
        expect(registry.size).toBe(1);
      } finally {
        socket.close();
      }
    });

    it('answers 401 without a credential', async () => {
      expect((await http().get('/workspaces/open-folders')).status).toBe(401);
      expect((await http().post('/workspaces/open-folders').send({ path: root })).status).toBe(401);
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
