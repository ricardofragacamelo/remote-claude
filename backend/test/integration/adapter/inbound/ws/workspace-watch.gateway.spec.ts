import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { setFlagsFromString } from 'node:v8';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { watch } from 'chokidar';
import type { FSWatcher } from 'chokidar';
import type { Envelope } from '@remote-claude/contracts';

import { ClaudeWrites, FOLDER_WATCHER, FolderWatches } from '@application/files';
import { ChokidarFolderWatcher } from '@adapter/outbound/filesystem/chokidar-folder.watcher';
import { AllowlistReloadSignal } from '@infra/config/allowlist-reload.signal';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT } from '../../../../support/app/test-app';
import type { TestAllowlist, TestApp } from '../../../../support/app/test-app';
import { waitFor } from '../../../../support/app/wait-for';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';
import { inotifyWatches } from '../../../../support/files/inotify';

/** Somebody else, with a root of their own beside ours. */
const OTHER = 'auth|7';

/** How many folders one connection may follow in this suite — small, so S-141 is cheap. */
const PER_CONNECTION = 4;

/** What the refusal of the system looks like when chokidar hears it. */
function enospc(): NodeJS.ErrnoException {
  return Object.assign(new Error('ENOSPC: System limit for number of file watchers reached'), {
    code: 'ENOSPC',
  });
}

/** Three roots: ours, one we lose in a reload, and somebody else's. */
function writeAllowlist(
  file: string,
  roots: { mine: string; lost: string | null; theirs: string },
) {
  const entry = (root: string, subject: string): string =>
    `  - path: ${root}\n    label: Suite\n    users:\n      - ${subject}\n`;

  writeFileSync(
    file,
    `roots:\n${entry(roots.mine, SUBJECT)}${roots.lost === null ? '' : entry(roots.lost, SUBJECT)}${entry(roots.theirs, OTHER)}`,
    'utf8',
  );
}

/**
 * Following a folder over the socket — plan 07, B-21 and B-23.
 *
 * The real gateway, the real registry and the real `chokidar` over real temporary folders. The
 * one stand-in is how the system refuses a watch: no suite can spend the machine's inotify budget,
 * so the watcher of S-135 is chokidar itself, told `ENOSPC` the way the kernel tells it — the real
 * refusal at the real limit is measured by `scripts/watcher-spike.mjs` (D-08).
 */
describe('workspace.watch over the socket', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let roots: { mine: string; lost: string; theirs: string };
  let allowlist: TestAllowlist;
  let folder: string;
  /** What the next watcher started is told before it is ready, when anything. */
  let refuseNext: NodeJS.ErrnoException | null = null;
  let lastStarted: FSWatcher | null = null;
  const open: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'rc-watch-')));
    roots = {
      mine: path.join(base, 'mine'),
      lost: path.join(base, 'lost'),
      theirs: path.join(base, 'theirs'),
    };
    for (const root of Object.values(roots)) {
      mkdirSync(root);
    }
    allowlist = { file: path.join(base, 'allowlist.yaml'), root: roots.mine };
    writeAllowlist(allowlist.file, roots);

    harness = await startTestApp(
      database.url,
      identity,
      (builder) =>
        builder.overrideProvider(FOLDER_WATCHER).useFactory({
          inject: [LOGGER],
          factory: (logger: Logger) =>
            new ChokidarFolderWatcher(logger, (root, options) => {
              const started = watch(root, options);
              const refusal = refuseNext;
              refuseNext = null;
              lastStarted = started;

              if (refusal !== null) {
                queueMicrotask(() => started.emit('error', refusal));
              }

              return started;
            }),
        }),
      allowlist,
      {
        RC_FILES_WATCH_MAX_PER_CONNECTION: String(PER_CONNECTION),
        RC_WS_MAX_FRAMES_PER_SECOND: '100000',
      },
    );
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(({ task }) => {
    folder = path.join(roots.mine, task.id);
    mkdirSync(folder, { recursive: true });
  });

  afterEach(async () => {
    for (const socket of open.splice(0)) {
      socket.close();
    }

    await openWatchersBecome(0);
  });

  const watches = (): FolderWatches => harness.app.get(FolderWatches);

  /** Until the open watchers are `count` — a close is asynchronous, and a busy machine is slow. */
  const openWatchersBecome = (count: number): Promise<number> =>
    waitFor(
      'the open watchers',
      () => Promise.resolve(watches().openWatchers),
      (n) => n === count,
      10_000,
    );

  async function connect(subject = SUBJECT, installId?: string): Promise<TestSocket> {
    const socket = await TestSocket.open(harness.url);
    open.push(socket);
    socket.send(
      commandFrame('connection.authenticate', {
        token: await identity.accessToken({ subject }),
        locale: 'en',
        client:
          installId === undefined
            ? { kind: 'web', version: '0.0.0' }
            : { kind: 'mobile', version: '0.0.0', installId },
      }),
    );
    expect((await socket.next()).type).toBe('connection.ready');
    return socket;
  }

  /** Sends `workspace.watch` and answers what came back for it — the ack or the error. */
  async function watchOn(socket: TestSocket, workspacePath: unknown): Promise<Envelope> {
    const frame = commandFrame('workspace.watch', { workspacePath });
    socket.send(frame);
    return until(socket, (each) => each.correlationId === frame['id']);
  }

  async function watchId(socket: TestSocket, workspacePath: string): Promise<string> {
    const ack = await watchOn(socket, workspacePath);
    expect(ack.type).toBe('workspace.watching');
    return String(ack.payload?.['watchId']);
  }

  async function unwatch(socket: TestSocket, id: string): Promise<Envelope> {
    const frame = commandFrame('workspace.unwatch', { watchId: id });
    socket.send(frame);
    return until(socket, (each) => each.correlationId === frame['id']);
  }

  async function until(
    socket: TestSocket,
    matches: (frame: Envelope) => boolean,
  ): Promise<Envelope> {
    for (let taken = 0; taken < 200; taken += 1) {
      const frame = await socket.next();

      if (matches(frame)) {
        return frame;
      }
    }

    throw new Error('the frame never came');
  }

  /** The next change event of a subscription that names `changed` — earlier ones are skipped. */
  function changeOf(socket: TestSocket, id: string, changed: string): Promise<Envelope> {
    return until(
      socket,
      (frame) =>
        frame.type === 'workspace.filesChanged' &&
        frame.payload?.['watchId'] === id &&
        (frame.payload['changes'] as { path: string }[]).some((each) => each.path === changed),
    );
  }

  const changes = (frame: Envelope): unknown => frame.payload?.['changes'];

  describe('what it refuses', () => {
    it('lists every invalid field and keeps the socket — S-03', async () => {
      const socket = await connect();

      const missing = await watchOn(socket, undefined);
      const wrongType = await watchOn(socket, 42);

      expect(missing.payload).toMatchObject({
        code: 'INVALID_INPUT',
        details: [expect.objectContaining({ field: 'workspacePath' })],
      });
      expect(wrongType.payload).toMatchObject({
        code: 'INVALID_INPUT',
        details: [expect.objectContaining({ field: 'workspacePath' })],
      });
      expect(socket.isOpen).toBe(true);
      expect((await watchOn(socket, folder)).type).toBe('workspace.watching');
    });

    it("refuses a folder outside the allowlist, and somebody else's — S-136", async () => {
      const socket = await connect();
      const theirs = path.join(roots.theirs, 'project');
      mkdirSync(theirs, { recursive: true });

      const outside = await watchOn(socket, tmpdir());
      const forbidden = await watchOn(socket, theirs);

      expect(outside.payload).toMatchObject({ code: 'WORKSPACE_NOT_ALLOWED' });
      expect(forbidden.payload).toMatchObject({ code: 'FORBIDDEN' });
      expect(watches().openWatchers).toBe(0);
    });

    it('refuses past the ceiling of the connection, with the limit — S-141', async () => {
      const socket = await connect();
      for (let index = 0; index < PER_CONNECTION; index += 1) {
        mkdirSync(path.join(folder, `f${String(index)}`));
        await watchId(socket, path.join(folder, `f${String(index)}`));
      }
      mkdirSync(path.join(folder, 'one-more'));

      const refused = await watchOn(socket, path.join(folder, 'one-more'));

      expect(refused.payload).toMatchObject({
        code: 'WATCH_LIMIT_REACHED',
        params: { limit: PER_CONNECTION },
      });
      expect(watches().subscriptions).toBe(PER_CONNECTION);
    });

    it('says WATCH_UNAVAILABLE when the system refuses, and holds nothing — S-135', async () => {
      const socket = await connect();
      const before = inotifyWatches();
      refuseNext = enospc();

      const refused = await watchOn(socket, folder);

      expect(refused.payload).toMatchObject({
        code: 'WATCH_UNAVAILABLE',
        params: { retryAfterSeconds: 30 },
      });
      expect(socket.isOpen).toBe(true);
      expect(watches().openWatchers).toBe(0);
      await waitFor(
        'the refused watcher let go',
        () => Promise.resolve(inotifyWatches()),
        (n) => n <= before,
        10_000,
      );
    });

    it('stops with systemLimit when the system refuses a running watcher', async () => {
      const socket = await connect();
      const id = await watchId(socket, folder);

      lastStarted?.emit('error', enospc());

      const stopped = await until(socket, (frame) => frame.type === 'workspace.watchStopped');
      expect(stopped.payload).toEqual({ watchId: id, reason: 'systemLimit' });
      await openWatchersBecome(0);
    });
  });

  describe('one watcher, many subscriptions', () => {
    it('answers the real path, and tells created, changed and deleted — S-129', async () => {
      const socket = await connect();
      const ack = await watchOn(socket, `${folder}/./`);
      const id = String(ack.payload?.['watchId']);
      expect(ack.payload).toMatchObject({
        watchId: expect.stringMatching(/^w_/),
        workspacePath: folder,
      });

      writeFileSync(path.join(folder, 'a.txt'), 'one');
      expect(changes(await changeOf(socket, id, 'a.txt'))).toEqual([
        { path: 'a.txt', kind: 'created', origin: 'external' },
      ]);

      writeFileSync(path.join(folder, 'a.txt'), 'two');
      expect(changes(await changeOf(socket, id, 'a.txt'))).toEqual([
        { path: 'a.txt', kind: 'changed', origin: 'external' },
      ]);

      rmSync(path.join(folder, 'a.txt'));
      expect(changes(await changeOf(socket, id, 'a.txt'))).toEqual([
        { path: 'a.txt', kind: 'deleted', origin: 'external' },
      ]);
    });

    it('keeps one watcher for two connections, and the other after one unwatches — S-137', async () => {
      const first = await connect();
      const second = await connect();
      const firstId = await watchId(first, folder);
      const secondId = await watchId(second, folder);

      expect(watches().openWatchers).toBe(1);
      expect(watches().subscriptions).toBe(2);

      await unwatch(first, firstId);
      writeFileSync(path.join(folder, 'kept.txt'), 'x');

      expect(changes(await changeOf(second, secondId, 'kept.txt'))).toEqual([
        { path: 'kept.txt', kind: 'created', origin: 'external' },
      ]);
      expect(watches().openWatchers).toBe(1);
    });

    it("rides a subfolder on its parent's watcher, relative to itself — S-138", async () => {
      mkdirSync(path.join(folder, 'pkg'));
      const parent = await connect();
      const child = await connect();
      const parentId = await watchId(parent, folder);
      const childId = await watchId(child, path.join(folder, 'pkg'));

      expect(watches().openWatchers).toBe(1);

      writeFileSync(path.join(folder, 'pkg', 'x.ts'), 'x');

      expect(changes(await changeOf(child, childId, 'x.ts'))).toEqual([
        { path: 'x.ts', kind: 'created', origin: 'external' },
      ]);
      expect(changes(await changeOf(parent, parentId, 'pkg/x.ts'))).toEqual([
        { path: 'pkg/x.ts', kind: 'created', origin: 'external' },
      ]);
    });

    it('answers a repeated watch with the same watchId, and counts it once — S-139', async () => {
      const socket = await connect();

      const first = await watchId(socket, folder);
      const again = await watchId(socket, folder);

      expect(again).toBe(first);
      expect(watches().subscriptions).toBe(1);
    });

    it('acknowledges an unwatch it does not know — S-140', async () => {
      const socket = await connect();

      const ack = await unwatch(socket, 'w_nobody');

      expect(ack).toMatchObject({
        kind: 'ack',
        type: 'command.accepted',
        payload: { command: 'workspace.unwatch' },
      });
    });
  });

  describe('letting go', () => {
    it('releases the subscriptions of a socket that drops, and the watcher with the last — S-142', async () => {
      const socket = await connect();
      await watchId(socket, folder);
      expect(watches().openWatchers).toBe(1);

      socket.close();

      await openWatchersBecome(0);
      expect(watches().subscriptions).toBe(0);
    });

    it('stops with allowlistChanged when a reload takes the folder away — S-143', async () => {
      const lostFolder = path.join(roots.lost, 'project');
      mkdirSync(lostFolder, { recursive: true });
      const socket = await connect();
      const kept = await watchId(socket, folder);
      const lost = await watchId(socket, lostFolder);

      try {
        writeAllowlist(allowlist.file, { ...roots, lost: null });
        harness.app.get(AllowlistReloadSignal).reload();

        const stopped = await until(socket, (frame) => frame.type === 'workspace.watchStopped');
        expect(stopped.payload).toEqual({ watchId: lost, reason: 'allowlistChanged' });
        await openWatchersBecome(1);

        writeFileSync(path.join(folder, 'still.txt'), 'x');
        expect(changes(await changeOf(socket, kept, 'still.txt'))).toEqual([
          { path: 'still.txt', kind: 'created', origin: 'external' },
        ]);
      } finally {
        writeAllowlist(allowlist.file, roots);
        harness.app.get(AllowlistReloadSignal).reload();
      }
    });

    it('stops with folderDeleted when the folder is deleted — S-144', async () => {
      const socket = await connect();
      const id = await watchId(socket, folder);
      writeFileSync(path.join(folder, 'inside.txt'), 'x');

      rmSync(folder, { recursive: true });

      const stopped = await until(socket, (frame) => frame.type === 'workspace.watchStopped');
      expect(stopped.payload).toEqual({ watchId: id, reason: 'folderDeleted' });
      await openWatchersBecome(0);
    });

    it('returns watchers, watches and memory to where they were after a thousand cycles — S-145', async () => {
      const socket = await connect();
      const gc = collector();
      // A first cycle warms up what is built once — the handler, the codec — and is not a leak.
      await unwatch(socket, await watchId(socket, folder));
      gc();
      const before = { watches: inotifyWatches(), heap: process.memoryUsage().heapUsed };

      for (let cycle = 0; cycle < 1_000; cycle += 1) {
        await unwatch(socket, await watchId(socket, folder));
      }

      await openWatchersBecome(0);
      gc();
      expect(watches().subscriptions).toBe(0);
      expect(inotifyWatches()).toBe(before.watches);
      expect(process.memoryUsage().heapUsed - before.heap).toBeLessThan(8 * 1024 * 1024);
    }, 120_000);

    it('closes every watcher when the application shuts down — S-146', async () => {
      const before = inotifyWatches();
      const other = await startTestApp(database.url, identity, (builder) => builder, allowlist);
      const socket = await TestSocket.open(other.url);
      open.push(socket);
      socket.send(
        commandFrame('connection.authenticate', {
          token: await identity.accessToken({ subject: SUBJECT }),
          locale: 'en',
          client: { kind: 'web', version: '0.0.0' },
        }),
      );
      await socket.next();
      socket.send(commandFrame('workspace.watch', { workspacePath: folder }));
      expect((await socket.next()).type).toBe('workspace.watching');
      expect(inotifyWatches()).toBeGreaterThan(before);

      await other.close();

      expect(other.app.get(FolderWatches).openWatchers).toBe(0);
      expect(inotifyWatches()).toBe(before);
      expect(other.log.withOp('server.shutdown').at(-1)).toMatchObject({ watchers: 1 });
    });

    it('releases the subscriptions of a revoked device when its socket closes — S-147', async () => {
      const token = await identity.accessToken({ subject: SUBJECT });
      const http = request(harness.app.getHttpServer());
      const registered = await http.post('/devices').set('authorization', `Bearer ${token}`).send({
        installId: 'install-watch',
        name: 'Pixel 8',
        platform: 'android',
        appVersion: '1.0.0',
      });
      const deviceId = String(registered.body.id);
      await http
        .post(`/devices/${deviceId}/approval`)
        .set('authorization', `Bearer ${token}`)
        .send({});
      const phone = await connect(SUBJECT, 'install-watch');
      await watchId(phone, folder);

      await http.delete(`/devices/${deviceId}/approval`).set('authorization', `Bearer ${token}`);

      expect((await phone.closed()).code).toBe(4401);
      await openWatchersBecome(0);
    });
  });

  describe('the stream', () => {
    it('numbers each watchId from 1, with no session on the frame — S-152', async () => {
      const socket = await connect();
      const id = await watchId(socket, folder);

      writeFileSync(path.join(folder, 'one.txt'), '1');
      const first = await changeOf(socket, id, 'one.txt');
      writeFileSync(path.join(folder, 'two.txt'), '2');
      const second = await changeOf(socket, id, 'two.txt');

      expect(first).toMatchObject({ kind: 'event', seq: 1 });
      expect(second.seq).toBe(2);
      expect(first.sessionId).toBeUndefined();
    });

    it('tells each connection only of its own folder — S-153', async () => {
      const other = path.join(folder, '..', `${path.basename(folder)}-b`);
      mkdirSync(other);
      const a = await connect();
      const b = await connect();
      const aId = await watchId(a, folder);
      const bId = await watchId(b, other);

      writeFileSync(path.join(other, 'b.txt'), 'b');
      await changeOf(b, bId, 'b.txt');
      writeFileSync(path.join(folder, 'a.txt'), 'a');

      expect(changes(await until(a, (frame) => frame.type === 'workspace.filesChanged'))).toEqual([
        { path: 'a.txt', kind: 'created', origin: 'external' },
      ]);
      expect(aId).not.toBe(bId);
    });

    it('starts over after a reconnect: a new watchId, seq from 1, nothing resent — S-154', async () => {
      const first = await connect();
      const firstId = await watchId(first, folder);
      writeFileSync(path.join(folder, 'before.txt'), 'x');
      await changeOf(first, firstId, 'before.txt');
      first.close();
      await openWatchersBecome(0);

      const again = await connect();
      const againId = await watchId(again, folder);
      writeFileSync(path.join(folder, 'after.txt'), 'x');

      const frame = await until(again, (each) => each.type === 'workspace.filesChanged');
      expect(againId).not.toBe(firstId);
      expect(frame.seq).toBe(1);
      expect(changes(frame)).toEqual([{ path: 'after.txt', kind: 'created', origin: 'external' }]);
    });

    it('logs files.watch at debug with the folder and the counts, never the contents — S-156', async () => {
      const socket = await connect();
      const id = await watchId(socket, folder);
      const secret = `contents-${createHash('sha256').update(folder).digest('hex')}`;

      writeFileSync(path.join(folder, 'secret.txt'), secret);
      await changeOf(socket, id, 'secret.txt');

      const lines = harness.log.withOp('files.watch');
      expect(lines).toContainEqual(
        expect.objectContaining({
          level: 'debug',
          watchId: id,
          folder,
          watchers: 1,
          subscriptions: 1,
        }),
      );
      expect(lines).toContainEqual(
        expect.objectContaining({ level: 'debug', watchId: id, seq: 1, changes: 1 }),
      );
      expect(JSON.stringify(harness.log.lines)).not.toContain(secret);
    });
  });

  describe('who changed it', () => {
    it("labels the person's save user, and Claude's write claude — S-148, S-149", async () => {
      const socket = await connect();
      const id = await watchId(socket, folder);
      writeFileSync(path.join(folder, 'mine.txt'), 'before\n');
      await changeOf(socket, id, 'mine.txt');
      const token = await identity.accessToken({ subject: SUBJECT });
      const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

      await request(harness.app.getHttpServer())
        .put('/files/content')
        .set('authorization', `Bearer ${token}`)
        .set('if-match', `"${sha('before\n')}"`)
        .send({ folder, path: 'mine.txt', content: 'saved by the person\n' })
        .expect(200);
      const saved = await changeOf(socket, id, 'mine.txt');

      harness.app.get(ClaudeWrites).record({
        path: path.join(folder, 'claude.txt'),
        hash: sha('by claude\n'),
        at: new Date(),
      });
      writeFileSync(path.join(folder, 'claude.txt'), 'by claude\n');
      const claude = await changeOf(socket, id, 'claude.txt');

      expect(changes(saved)).toEqual([{ path: 'mine.txt', kind: 'changed', origin: 'user' }]);
      expect(changes(claude)).toEqual([{ path: 'claude.txt', kind: 'created', origin: 'claude' }]);
    });
  });
});

/** `gc()`, which a suite only has when it asks V8 for it. */
function collector(): () => void {
  setFlagsFromString('--expose-gc');
  return runInNewContext('gc') as () => void;
}
