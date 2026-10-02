import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ChokidarOptions, FSWatcher } from 'chokidar';

import type { FolderChange } from '@domain/files';
import { WatchUnavailableError } from '@domain/files';
import type { WatcherStop } from '@application/files';
import { ChokidarFolderWatcher } from '@adapter/outbound/filesystem/chokidar-folder.watcher';
import { waitFor } from '../../../../support/app/wait-for';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

/** A chokidar the test drives: it is ready when told, and says what it is told to. */
class ScriptedChokidar extends EventEmitter {
  closed = 0;
  options: ChokidarOptions | null = null;

  close(): Promise<void> {
    this.closed += 1;
    return Promise.resolve();
  }

  getWatched(): Record<string, string[]> {
    return { '/r/app': ['src'], '/r/app/src': [] };
  }
}

const limit = (code = 'ENOSPC'): NodeJS.ErrnoException =>
  Object.assign(new Error(`${code}: System limit`), { code });

function harness() {
  const log = new RecordingLogger();
  const chokidar = new ScriptedChokidar();
  const changes: FolderChange[] = [];
  const stops: WatcherStop[] = [];
  const watcher = new ChokidarFolderWatcher(log.logger, (_root, options) => {
    chokidar.options = options;
    return chokidar as unknown as FSWatcher;
  });
  const listener = {
    changed: (change: FolderChange) => changes.push(change),
    stopped: (reason: WatcherStop) => stops.push(reason),
  };

  return { log, chokidar, changes, stops, watcher, listener };
}

/** Lets the start run up to waiting for `ready`. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('ChokidarFolderWatcher — B-20, D-08', () => {
  it('asks chokidar to leave the unwatched folders, its own side files and links alone — S-134', async () => {
    const { chokidar, watcher, listener } = harness();
    const started = watcher.watch('/r/app', listener);
    await settle();
    chokidar.emit('ready');
    await started;

    const ignored = chokidar.options?.ignored as (path: string) => boolean;
    expect(ignored('/r/app/node_modules')).toBe(true);
    expect(ignored('/r/app/.git')).toBe(true);
    expect(ignored('/r/app/src/.a.ts.rc-01J0000000000000000000000A.tmp')).toBe(true);
    expect(ignored('/r/app/src/a.ts')).toBe(false);
    expect(ignored('/r/app')).toBe(false);
    expect(chokidar.options).toMatchObject({ ignoreInitial: true, followSymlinks: false });
  });

  it('tells each change relative to the folder, and nothing for the other events', async () => {
    const { chokidar, changes, watcher, listener } = harness();
    const started = watcher.watch('/r/app', listener);
    await settle();
    chokidar.emit('ready');
    await started;

    for (const [event, file] of [
      ['add', '/r/app/a.ts'],
      ['addDir', '/r/app/src'],
      ['change', '/r/app/a.ts'],
      ['unlink', '/r/app/a.ts'],
      ['unlinkDir', '/r/app'],
      ['raw', '/r/app/x'],
    ]) {
      chokidar.emit('all', event, file);
    }

    expect(changes).toEqual([
      { path: 'a.ts', kind: 'created' },
      { path: 'src', kind: 'created' },
      { path: 'a.ts', kind: 'changed' },
      { path: 'a.ts', kind: 'deleted' },
      { path: '', kind: 'deleted' },
    ]);
  });

  it('refuses the start when the system refused a watch before ready, and holds nothing — S-135', async () => {
    const { chokidar, watcher, listener, log } = harness();
    const started = watcher.watch('/r/app', listener);
    await settle();

    chokidar.emit('error', limit());
    chokidar.emit('error', limit('EMFILE'));
    chokidar.emit('ready');

    await expect(started).rejects.toBeInstanceOf(WatchUnavailableError);
    await expect(started).rejects.toMatchObject({ params: { retryAfterSeconds: 30 } });
    expect(chokidar.closed).toBe(1);
    expect(log.withOp('files.watch')).toContainEqual(
      expect.objectContaining({ level: 'warn', folder: '/r/app' }),
    );
  });

  it('stops, once, when the system refuses a watch after it started', async () => {
    const { chokidar, stops, watcher, listener } = harness();
    const started = watcher.watch('/r/app', listener);
    await settle();
    chokidar.emit('ready');
    const open = await started;

    chokidar.emit('error', limit());
    chokidar.emit('error', limit());
    await open.close();

    expect(stops).toEqual(['systemLimit']);
    expect(chokidar.closed).toBe(1);
  });

  it('carries on past any other error, and says so', async () => {
    const { chokidar, stops, watcher, listener, log } = harness();
    const started = watcher.watch('/r/app', listener);
    await settle();
    chokidar.emit('error', limit('EACCES'));
    chokidar.emit('ready');
    await started;

    chokidar.emit('error', null);

    expect(stops).toEqual([]);
    expect(
      log
        .withOp('files.watch')
        .filter((line) => line.msg === 'a part of the folder could not be watched'),
    ).toHaveLength(2);
  });

  it('logs how many folders it holds once ready', async () => {
    const { chokidar, watcher, listener, log } = harness();
    const started = watcher.watch('/r/app', listener);
    await settle();
    chokidar.emit('ready');
    await started;

    expect(log.withOp('files.watch')).toContainEqual(
      expect.objectContaining({ level: 'debug', folder: '/r/app', directories: 2 }),
    );
  });

  it('says the folder itself is gone when its own rename leaves nothing behind — S-144', async () => {
    const base = mkdtempSync(path.join(tmpdir(), 'rc-root-'));
    const root = path.join(base, 'app');
    const { chokidar, changes, watcher, listener, log } = harness();
    const started = watcher.watch(root, listener);
    await settle();
    chokidar.emit('ready');
    await started;

    chokidar.emit('raw', 'rename', 'other', { watchedPath: root });
    chokidar.emit('raw', 'change', 'app', { watchedPath: root });
    chokidar.emit('raw', 'rename', 'app', { watchedPath: base });
    chokidar.emit('raw', 'rename', 'app', null);
    chokidar.emit('raw', 'rename', 'app', { watchedPath: root });
    await waitFor(
      'the check of the folder',
      () => Promise.resolve(log.withOp('files.watch')),
      (lines) => lines.some((line) => line.msg === 'the watched folder is gone'),
    );

    expect(changes).toEqual([{ path: '', kind: 'deleted' }]);
    rmSync(base, { recursive: true, force: true });
  });

  it('says nothing when the folder is still there after a rename it heard', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'rc-root-'));
    const { chokidar, changes, watcher, listener, log } = harness();
    const started = watcher.watch(root, listener);
    await settle();
    chokidar.emit('ready');
    await started;

    chokidar.emit('raw', 'rename', path.basename(root), { watchedPath: root });
    await waitFor(
      'the check of the folder',
      () => Promise.resolve(log.withOp('files.watch')),
      (lines) => lines.some((line) => line.msg === 'the watched folder is still there'),
    );

    expect(changes).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });
});
