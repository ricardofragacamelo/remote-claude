import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { ChangeOrigins, ClaudeWrites, FolderWatches, UserWrites } from '@application/files';
import type { LabelledChange, WatchSink, WatchStopReason } from '@application/files';
import { UserId } from '@domain/auth';
import { WorkspacePath } from '@domain/workspace';
import { SocketWatchSinks } from '@adapter/inbound/ws/files/socket-watch.sinks';
import { ChokidarFolderWatcher } from '@adapter/outbound/filesystem/chokidar-folder.watcher';
import { NodeFolderDisk } from '@adapter/outbound/filesystem/node-folder-disk';
import { ConnectionRegistry } from '@infra/websocket/connection-registry';
import type { Sendable } from '@infra/websocket/connection-registry';
import { EventBuffer } from '@infra/websocket/event-buffer';
import { FrameBuilder } from '@infra/websocket/frame-builder';
import { SessionHub } from '@infra/websocket/session-hub';
import { SystemClock } from '@shared/time/system-clock';
import { SystemScheduler } from '@shared/time/system-scheduler';
import { UlidGenerator } from '@shared/ids/ulid-generator';
import { waitFor } from '../../../../support/app/wait-for';
import { inotifyWatches } from '../../../../support/files/inotify';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

const owner = UserId.create('auth|42');

/** A sink that writes down every batch, in order. */
class RecordingSink implements WatchSink {
  readonly open = true;
  readonly batches: { changes: readonly LabelledChange[]; overflow: boolean }[] = [];
  readonly stops: WatchStopReason[] = [];

  changes(_watchId: string, changes: readonly LabelledChange[], overflow: boolean): void {
    this.batches.push({ changes, overflow });
  }

  stopped(_watchId: string, reason: WatchStopReason): void {
    this.stops.push(reason);
  }

  end(): void {
    // Nothing held.
  }

  /** Every change of every batch, flattened. */
  get all(): LabelledChange[] {
    return this.batches.flatMap((batch) => batch.changes);
  }
}

/**
 * The real watcher over real folders, under the real registry — 07 · B-19, B-20, B-23.
 *
 * Nothing in between is a stand-in: chokidar, the disk, the timer of the window. What a scenario
 * waits for, it waits for by polling what arrived, never by sleeping.
 */
describe('the folder watcher over the disk', () => {
  let base: string;
  let log: RecordingLogger;
  let watches: FolderWatches;

  const settings = { windowMs: 150, maxChangesPerEvent: 20, maxPerConnection: 8 };

  /** The registry over the real watcher, with a window of its own. */
  function registry(windowMs = settings.windowMs): FolderWatches {
    return new FolderWatches(
      { resolve: (raw: string) => Promise.resolve(WorkspacePath.create(raw)) },
      new ChokidarFolderWatcher(log.logger),
      new ChangeOrigins(
        new ClaudeWrites(),
        new UserWrites(new SystemClock()),
        new NodeFolderDisk(log.logger),
        new SystemClock(),
        () => undefined,
      ),
      new SystemScheduler(),
      new UlidGenerator(),
      { ...settings, windowMs },
    );
  }

  beforeEach(() => {
    base = realpathSync(mkdtempSync(path.join(tmpdir(), 'rc-watcher-')));
    log = new RecordingLogger();
    watches = registry();
  });

  afterEach(async () => {
    await watches.closeAll();
    rmSync(base, { recursive: true, force: true });
  });

  async function follow(
    folder: string,
    sink: WatchSink = new RecordingSink(),
    connectionId = 'c1',
  ) {
    await watches.watch({ connectionId, userId: owner, folder, sink });
    return sink;
  }

  function until(sink: RecordingSink, what: string, holds: (all: LabelledChange[]) => boolean) {
    return waitFor(what, () => Promise.resolve(sink.all), holds, 5_000);
  }

  it('spends no watch on the folders it does not watch — S-128', async () => {
    const at = (...parts: string[]): string => path.join(base, ...parts);
    let excluded = 0;
    for (let index = 0; index < 60; index += 1) {
      mkdirSync(at('node_modules', `pkg-${String(index)}`, 'lib'), { recursive: true });
      mkdirSync(at('.git', 'objects', `o${String(index)}`), { recursive: true });
      excluded += 3;
    }
    mkdirSync(at('dist', 'assets'), { recursive: true });
    mkdirSync(at('src', 'deep'), { recursive: true });
    writeFileSync(at('src', 'a.ts'), 'a');
    writeFileSync(at('src', 'deep', 'b.ts'), 'b');
    writeFileSync(at('readme.md'), '#');
    // The root, `src`, `src/deep`, three files — and the excluded folders themselves, which are
    // listed by their parent and never opened.
    const watchedEntries = 6;
    const before = inotifyWatches();

    await follow(base);

    const spent = inotifyWatches() - before;
    expect(spent).toBeGreaterThan(0);
    expect(spent).toBeLessThanOrEqual(watchedEntries);
    expect(spent).toBeLessThan(excluded);
  });

  it('tells nothing of a change under .git or an unwatched folder — S-134', async () => {
    mkdirSync(path.join(base, '.git'));
    mkdirSync(path.join(base, 'node_modules', 'x'), { recursive: true });
    mkdirSync(path.join(base, 'build'));
    const sink = (await follow(base)) as RecordingSink;

    writeFileSync(path.join(base, '.git', 'HEAD'), 'ref');
    writeFileSync(path.join(base, 'node_modules', 'x', 'index.js'), 'x');
    writeFileSync(path.join(base, 'build', 'out.js'), 'x');
    writeFileSync(path.join(base, 'marker.txt'), 'x');

    await until(sink, 'the marker', (all) => all.some((change) => change.path === 'marker.txt'));
    expect(sink.all.map((change) => change.path)).toEqual(['marker.txt']);
  });

  it('turns a burst of writes on one file into one changed — S-131', async () => {
    // A window that holds the whole burst on a busy machine too: five hundred writes take tens of
    // milliseconds alone, and hundreds while the rest of the suites run beside this one.
    watches = registry(2_000);
    writeFileSync(path.join(base, 'burst.txt'), 'start');
    const sink = (await follow(base)) as RecordingSink;

    for (let write = 0; write < 500; write += 1) {
      writeFileSync(path.join(base, 'burst.txt'), String(write));
    }

    await until(sink, 'the burst', (all) => all.length > 0);
    writeFileSync(path.join(base, 'marker.txt'), 'x');
    await until(sink, 'the marker', (all) => all.some((change) => change.path === 'marker.txt'));

    expect(sink.batches[0]?.changes).toEqual([
      { path: 'burst.txt', kind: 'changed', origin: 'external' },
    ]);
    expect(sink.all.filter((change) => change.path === 'burst.txt')).toHaveLength(1);
  });

  it('tells a rename as the old path deleted and the new one created — S-130', async () => {
    writeFileSync(path.join(base, 'old.txt'), 'x');
    const sink = (await follow(base)) as RecordingSink;

    renameSync(path.join(base, 'old.txt'), path.join(base, 'new.txt'));

    await until(sink, 'both paths', (all) => all.length >= 2);
    expect(sink.all).toEqual(
      expect.arrayContaining([
        { path: 'old.txt', kind: 'deleted', origin: 'external' },
        { path: 'new.txt', kind: 'created', origin: 'external' },
      ]),
    );
  });

  it('says overflow past the ceiling of one event — S-133', async () => {
    const sink = (await follow(base)) as RecordingSink;

    for (let index = 0; index < settings.maxChangesPerEvent + 10; index += 1) {
      writeFileSync(path.join(base, `f${String(index)}.txt`), 'x');
    }

    await waitFor(
      'an overflow',
      () => Promise.resolve(sink.batches),
      (batches) => batches.some((batch) => batch.overflow),
    );
    const overflowed = sink.batches.find((batch) => batch.overflow);
    expect(overflowed?.changes.length).toBe(settings.maxChangesPerEvent);
  });

  it('owes a slow connection an overflow and keeps delivering to the others — S-155', async () => {
    const registry = new ConnectionRegistry();
    const frames = new FrameBuilder(new SystemClock(), new UlidGenerator());
    const sinks = new SocketWatchSinks({
      registry,
      frames,
      hub: new SessionHub(registry, new EventBuffer(), frames, log.logger),
      scheduler: new SystemScheduler(),
      logger: log.logger,
      maxBufferedBytes: 1_024,
    });
    const wire = (): Sendable & { sent: Envelope[]; bufferedAmount: number } => {
      const sent: Envelope[] = [];
      return {
        sent,
        bufferedAmount: 0,
        send: (data: string) => sent.push(JSON.parse(data) as Envelope),
        close: () => undefined,
      };
    };
    const slow = wire();
    const fast = wire();
    registry.register('slow', slow);
    registry.register('fast', fast);
    const slowSink = sinks.open('slow');
    const fastSink = sinks.open('fast');
    await follow(base, slowSink, 'slow');
    await follow(base, fastSink, 'fast');
    slowSink.release();
    fastSink.release();
    slow.bufferedAmount = 1_000_000;

    for (const name of ['one.txt', 'two.txt', 'three.txt']) {
      writeFileSync(path.join(base, name), 'x');
      await waitFor(
        name,
        () => Promise.resolve(fast.sent),
        (sent) => sent.some((frame) => JSON.stringify(frame.payload).includes(name)),
      );
    }
    expect(slow.sent).toEqual([]);

    slow.bufferedAmount = 0;
    const [owed] = await waitFor(
      'the overflow owed',
      () => Promise.resolve(slow.sent),
      (sent) => sent.length > 0,
    );

    expect(owed).toMatchObject({ seq: 1, payload: { overflow: true } });
    expect(fast.sent.map((frame) => frame.seq)).toEqual(fast.sent.map((_, index) => index + 1));
  });
});
