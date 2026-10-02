import { beforeEach, describe, expect, it } from 'vitest';

import { ChangeOrigins, ClaudeWrites, FolderWatches, UserWrites } from '@application/files';
import type {
  FolderWatcher,
  FolderWatchListener,
  LabelledChange,
  OpenWatch,
  WatchSink,
  WatchStopReason,
} from '@application/files';
import { UserId } from '@domain/auth';
import { WatchLimitReachedError, WatchUnavailableError } from '@domain/files';
import { WorkspaceNotAllowedError, WorkspacePath } from '@domain/workspace';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { ManualScheduler } from '../../../support/fakes/manual-scheduler';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const owner = UserId.create('auth|42');

/** One watcher the fake started, and what it was told. */
interface Started {
  readonly root: string;
  readonly listener: FolderWatchListener;
  closed: number;
}

/** A watcher that starts at once — or when told to, or never — and remembers each one. */
class FakeWatcher implements FolderWatcher {
  readonly started: Started[] = [];
  refuse: Error | null = null;
  /** When set, a close waits for this before it is done. */
  closeGate: Promise<void> | null = null;
  hold: { release: () => void; fail: (error: Error) => void } | null = null;
  private holding = false;

  holdNext(): void {
    this.holding = true;
  }

  watch(root: string, listener: FolderWatchListener): Promise<OpenWatch> {
    const entry: Started = { root, listener, closed: 0 };
    const open: OpenWatch = {
      close: () => {
        entry.closed += 1;
        return this.closeGate ?? Promise.resolve();
      },
    };

    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }

    this.started.push(entry);

    if (!this.holding) {
      return Promise.resolve(open);
    }

    this.holding = false;
    return new Promise((resolve, reject) => {
      this.hold = { release: () => resolve(open), fail: reject };
    });
  }

  /** The listener of the watcher started for `root`. */
  of(root: string): Started {
    const found = this.started.find((entry) => entry.root === root);
    if (found === undefined) {
      throw new Error(`no watcher for ${root}`);
    }
    return found;
  }
}

/** A sink that writes down what it was handed. */
class RecordingSink implements WatchSink {
  open = true;
  readonly batches: { watchId: string; changes: readonly LabelledChange[]; overflow: boolean }[] =
    [];
  readonly stops: { watchId: string; reason: WatchStopReason }[] = [];
  ended = 0;

  changes(watchId: string, changes: readonly LabelledChange[], overflow: boolean): void {
    this.batches.push({ watchId, changes, overflow });
  }

  stopped(watchId: string, reason: WatchStopReason): void {
    this.stops.push({ watchId, reason });
  }

  end(): void {
    this.ended += 1;
  }
}

describe('FolderWatches — the subscriptions and their watchers — B-21', () => {
  let watcher: FakeWatcher;
  let scheduler: ManualScheduler;
  let refused: Set<string>;
  let watches: FolderWatches;

  const settings = { windowMs: 200, maxChangesPerEvent: 3, maxPerConnection: 2 };

  beforeEach(() => {
    watcher = new FakeWatcher();
    scheduler = new ManualScheduler();
    refused = new Set();
    watches = new FolderWatches(
      {
        resolve: (raw: string) =>
          refused.has(raw)
            ? Promise.reject(new WorkspaceNotAllowedError(raw))
            : Promise.resolve(WorkspacePath.create(raw.replace(/\/$/, ''))),
      },
      watcher,
      new ChangeOrigins(
        new ClaudeWrites(),
        new UserWrites(new FixedClock(new Date(0))),
        { version: () => Promise.reject(new Error('never read')) },
        new FixedClock(new Date(0)),
        () => undefined,
      ),
      scheduler,
      new SequentialIds(),
      settings,
    );
  });

  async function watch(folder: string, connectionId = 'c1', sink = new RecordingSink()) {
    const watching = await watches.watch({ connectionId, userId: owner, folder, sink });
    return { ...watching, sink };
  }

  /** Lets the window close and every delivery it started finish. */
  async function flush(): Promise<void> {
    scheduler.fire();
    for (let turn = 0; turn < 10; turn += 1) {
      await Promise.resolve();
    }
  }

  describe('watching', () => {
    it('starts one watcher, and names the subscription and the real folder', async () => {
      const watching = await watch('/r/app/');

      expect(watching).toMatchObject({ watchId: 'w_01J00000000000000000000001', folder: '/r/app' });
      expect(watcher.started.map((entry) => entry.root)).toEqual(['/r/app']);
      expect(watches.openWatchers).toBe(1);
      expect(watches.subscriptions).toBe(1);
    });

    it('answers the same subscription to the same folder on the same connection — S-139', async () => {
      const first = await watch('/r/app');
      const again = await watch('/r/app');

      expect(again.watchId).toBe(first.watchId);
      expect(watches.subscriptions).toBe(1);
    });

    it('shares one watcher between two connections — S-137', async () => {
      await watch('/r/app', 'c1');
      await watch('/r/app', 'c2');

      expect(watcher.started).toHaveLength(1);
      expect(watches.subscriptions).toBe(2);
    });

    it('rides a subfolder on the watcher above it, but not one under an unwatched path — S-138', async () => {
      await watch('/r/app', 'c1');
      await watch('/r/app/pkg', 'c2');
      await watch('/r/app/node_modules/lib', 'c3');

      expect(watcher.started.map((entry) => entry.root)).toEqual([
        '/r/app',
        '/r/app/node_modules/lib',
      ]);
    });

    it('refuses past the ceiling of the connection — S-141', async () => {
      await watch('/r/a');
      await watch('/r/b');

      await expect(watch('/r/c')).rejects.toBeInstanceOf(WatchLimitReachedError);
      expect(watcher.started).toHaveLength(2);
    });

    it('lets the folder refusal through, and starts nothing — S-136', async () => {
      refused.add('/r/secret');

      await expect(watch('/r/secret')).rejects.toBeInstanceOf(WorkspaceNotAllowedError);
      expect(watches.openWatchers).toBe(0);
    });

    it('lets the refusal of the system through, and keeps nothing — S-135', async () => {
      watcher.refuse = new WatchUnavailableError(30);

      await expect(watch('/r/app')).rejects.toBeInstanceOf(WatchUnavailableError);
      expect(watches.openWatchers).toBe(0);
      expect(watches.subscriptions).toBe(0);
    });

    it('fails every watch waiting on a start the system refuses', async () => {
      watcher.holdNext();
      const first = watch('/r/app', 'c1');
      const second = watch('/r/app', 'c2');
      await Promise.resolve();
      await Promise.resolve();

      watcher.hold?.fail(new WatchUnavailableError(30));

      await expect(first).rejects.toBeInstanceOf(WatchUnavailableError);
      await expect(second).rejects.toBeInstanceOf(WatchUnavailableError);
      expect(watches.openWatchers).toBe(0);
    });

    it('lets go at once of a subscription whose socket left while its watcher started', async () => {
      const sink = new RecordingSink();
      watcher.holdNext();
      const pending = watch('/r/app', 'c1', sink);
      await Promise.resolve();
      await Promise.resolve();

      sink.open = false;
      watcher.hold?.release();
      await pending;

      expect(watches.openWatchers).toBe(0);
      expect(watcher.of('/r/app').closed).toBe(1);
    });
  });

  describe('letting go', () => {
    it('acknowledges an unwatch it does not know — S-140', async () => {
      expect(await watches.unwatch('c1', 'w_nobody')).toBe(false);
      expect(await watches.unwatch('nobody', 'w_nobody')).toBe(false);
    });

    it('closes the watcher with the last subscription, not before — S-137', async () => {
      const first = await watch('/r/app', 'c1');
      const second = await watch('/r/app', 'c2');

      expect(await watches.unwatch('c1', first.watchId)).toBe(true);
      expect(watcher.of('/r/app').closed).toBe(0);

      await watches.unwatch('c2', second.watchId);
      expect(watcher.of('/r/app').closed).toBe(1);
      expect(watches.openWatchers).toBe(0);
      expect(first.sink.ended).toBe(1);
    });

    it('releases every subscription of a connection that is gone — S-142', async () => {
      await watch('/r/a', 'c1');
      await watch('/r/b', 'c1');
      await watch('/r/b', 'c2');

      expect(await watches.release('c1')).toBe(2);
      expect(await watches.release('c1')).toBe(0);
      expect(watches.openWatchers).toBe(1);
      expect(watches.subscriptions).toBe(1);
    });

    it('stops the subscriptions the allowlist no longer allows — S-143', async () => {
      const kept = await watch('/r/kept');
      const lost = await watch('/r/lost');
      refused.add('/r/lost');

      const stopped = await watches.revalidate();

      expect(stopped).toEqual([
        { watchId: lost.watchId, folder: '/r/lost', refusal: expect.any(WorkspaceNotAllowedError) },
      ]);
      expect(lost.sink.stops).toEqual([{ watchId: lost.watchId, reason: 'allowlistChanged' }]);
      expect(kept.sink.stops).toEqual([]);
      expect(watcher.of('/r/lost').closed).toBe(1);
      expect(watches.openWatchers).toBe(1);
    });

    it('closes every watcher at the shutdown, once — S-146', async () => {
      const one = await watch('/r/a', 'c1');
      await watch('/r/b', 'c2');

      expect(await watches.closeAll()).toBe(2);
      expect(await watches.closeAll()).toBe(0);
      expect(watcher.started.map((entry) => entry.closed)).toEqual([1, 1]);
      expect(one.sink.stops).toEqual([]);
      expect(one.sink.ended).toBe(1);
      expect(watches.subscriptions).toBe(0);
    });

    it('waits, at the shutdown, for a close already under way — S-146', async () => {
      const { watchId } = await watch('/r/app');
      let open = (): void => undefined;
      watcher.closeGate = new Promise((resolve) => {
        open = resolve;
      });
      const unwatching = watches.unwatch('c1', watchId);
      let finished = false;

      const shutdown = watches.closeAll().then((count) => {
        finished = true;
        return count;
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(finished).toBe(false);

      open();

      expect(await shutdown).toBe(1);
      await unwatching;
    });

    it('waits, at the shutdown, for a start in flight — and closes it once when it fails', async () => {
      watcher.holdNext();
      const pending = watch('/r/app');
      await Promise.resolve();
      await Promise.resolve();

      const closing = watches.closeAll();
      watcher.hold?.fail(new WatchUnavailableError(30));

      await expect(pending).rejects.toBeInstanceOf(WatchUnavailableError);
      expect(await closing).toBe(1);
      expect(watches.openWatchers).toBe(0);
    });

    it('stops every subscription of a watcher the system stopped', async () => {
      const parent = await watch('/r/app', 'c1');
      const child = await watch('/r/app/pkg', 'c2');

      watcher.of('/r/app').listener.stopped('systemLimit');
      await flush();

      expect(parent.sink.stops).toEqual([{ watchId: parent.watchId, reason: 'systemLimit' }]);
      expect(child.sink.stops).toEqual([{ watchId: child.watchId, reason: 'systemLimit' }]);
      expect(watches.openWatchers).toBe(0);
    });
  });

  describe('the window', () => {
    it('sends nothing before the window closes, and the folded changes after — S-131', async () => {
      const { sink, watchId } = await watch('/r/app');
      const { listener } = watcher.of('/r/app');

      for (let write = 0; write < 500; write += 1) {
        listener.changed({ path: 'a.ts', kind: 'changed' });
      }
      expect(sink.batches).toEqual([]);
      expect(scheduler.delays).toEqual([200]);

      await flush();

      expect(sink.batches).toEqual([
        {
          watchId,
          changes: [{ path: 'a.ts', kind: 'changed', origin: 'external' }],
          overflow: false,
        },
      ]);
    });

    it('tells each subscription its own paths, relative to itself — S-138', async () => {
      const parent = await watch('/r/app', 'c1');
      const child = await watch('/r/app/pkg', 'c2');
      const { listener } = watcher.of('/r/app');

      listener.changed({ path: 'pkg/x.ts', kind: 'created' });
      listener.changed({ path: 'top.ts', kind: 'created' });
      await flush();

      expect(child.sink.batches.map((batch) => batch.changes)).toEqual([
        [{ path: 'x.ts', kind: 'created', origin: 'external' }],
      ]);
      expect(parent.sink.batches.map((batch) => batch.changes)).toEqual([
        [
          { path: 'pkg/x.ts', kind: 'created', origin: 'external' },
          { path: 'top.ts', kind: 'created', origin: 'external' },
        ],
      ]);
    });

    it('says nothing to a subscription none of whose paths changed', async () => {
      await watch('/r/app', 'c1');
      const child = await watch('/r/app/pkg', 'c2');

      watcher.of('/r/app').listener.changed({ path: 'top.ts', kind: 'created' });
      await flush();

      expect(child.sink.batches).toEqual([]);
    });

    it('gives a subfolder opened first a watcher of its own', async () => {
      await watch('/r/app/pkg', 'c2');
      await watch('/r/app', 'c1');

      expect(watcher.started.map((entry) => entry.root)).toEqual(['/r/app/pkg', '/r/app']);
    });

    it('cuts at the per-event ceiling and says overflow — S-133', async () => {
      const { sink } = await watch('/r/app');
      const { listener } = watcher.of('/r/app');

      for (const name of ['a', 'b', 'c', 'd']) {
        listener.changed({ path: name, kind: 'created' });
      }
      await flush();

      expect(sink.batches[0]?.changes).toHaveLength(3);
      expect(sink.batches[0]?.overflow).toBe(true);
    });

    it('stops counting past the headroom of the window and tells everybody overflow', async () => {
      const { sink } = await watch('/r/app');
      const { listener } = watcher.of('/r/app');

      for (let index = 0; index <= settings.maxChangesPerEvent * 10; index += 1) {
        listener.changed({ path: `f${String(index)}`, kind: 'created' });
      }
      listener.changed({ path: 'after', kind: 'created' });
      await flush();

      expect(sink.batches).toEqual([
        { watchId: sink.batches[0]?.watchId, changes: [], overflow: true },
      ]);
    });

    it('stops a subscription whose folder was deleted, and tells the others — S-144', async () => {
      const parent = await watch('/r/app', 'c1');
      const child = await watch('/r/app/pkg', 'c2');
      const { listener } = watcher.of('/r/app');

      listener.changed({ path: 'pkg/x.ts', kind: 'deleted' });
      listener.changed({ path: 'pkg', kind: 'deleted' });
      await flush();

      expect(child.sink.stops).toEqual([{ watchId: child.watchId, reason: 'folderDeleted' }]);
      expect(child.sink.batches).toEqual([]);
      expect(parent.sink.batches[0]?.changes).toEqual([
        { path: 'pkg/x.ts', kind: 'deleted', origin: 'external' },
        { path: 'pkg', kind: 'deleted', origin: 'external' },
      ]);
      expect(watches.openWatchers).toBe(1);
    });

    it('stops everybody and closes the watcher when the watched folder goes — S-144', async () => {
      const { sink, watchId } = await watch('/r/app');

      watcher.of('/r/app').listener.changed({ path: '', kind: 'deleted' });
      await flush();

      expect(sink.stops).toEqual([{ watchId, reason: 'folderDeleted' }]);
      expect(watches.openWatchers).toBe(0);
    });

    it('ignores what a closed watcher still reports, and arms no window for it', async () => {
      const { watchId } = await watch('/r/app');
      const { listener } = watcher.of('/r/app');
      await watches.unwatch('c1', watchId);

      listener.changed({ path: 'late.ts', kind: 'created' });

      expect(scheduler.armed).toBe(0);
    });

    it('calls off an armed window when the watcher closes', async () => {
      const { watchId } = await watch('/r/app');
      watcher.of('/r/app').listener.changed({ path: 'a.ts', kind: 'created' });

      await watches.unwatch('c1', watchId);

      expect(scheduler.armed).toBe(0);
    });
  });
});
