import { beforeEach, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import {
  CATCH_UP_INTERVAL_MS,
  SocketWatchSinks,
} from '@adapter/inbound/ws/files/socket-watch.sinks';
import type { SocketWatchSink } from '@adapter/inbound/ws/files/socket-watch.sinks';
import { ConnectionRegistry } from '@infra/websocket/connection-registry';
import type { Sendable } from '@infra/websocket/connection-registry';
import { EventBuffer } from '@infra/websocket/event-buffer';
import { FrameBuilder } from '@infra/websocket/frame-builder';
import { SessionHub } from '@infra/websocket/session-hub';
import { FixedClock } from '../../../../../support/fakes/fixed-clock';
import { ManualScheduler } from '../../../../../support/fakes/manual-scheduler';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';
import { SequentialIds } from '../../../../../support/fakes/sequential-ids';

/** A socket that keeps what it was sent, and can be made to fall behind. */
function socket(): Sendable & { sent: Envelope[]; bufferedAmount: number } {
  const sent: Envelope[] = [];
  return {
    sent,
    bufferedAmount: 0,
    send: (data: string) => sent.push(JSON.parse(data) as Envelope),
    close: () => undefined,
  };
}

const change = { path: 'a.ts', kind: 'changed', origin: 'external' } as const;

describe('SocketWatchSink — the stream of one watchId — B-23', () => {
  let registry: ConnectionRegistry;
  let scheduler: ManualScheduler;
  let log: RecordingLogger;
  let wire: ReturnType<typeof socket>;
  let sink: SocketWatchSink;

  beforeEach(() => {
    registry = new ConnectionRegistry();
    scheduler = new ManualScheduler();
    log = new RecordingLogger();
    wire = socket();
    registry.register('c1', wire);
    const frames = new FrameBuilder(new FixedClock(new Date(0)), new SequentialIds());

    sink = new SocketWatchSinks({
      registry,
      frames,
      hub: new SessionHub(registry, new EventBuffer(), frames, log.logger),
      scheduler,
      logger: log.logger,
      maxBufferedBytes: 100,
    }).open('c1');
  });

  it('sends nothing before the ack, and numbers from 1 after it, without a session — S-152', () => {
    sink.changes('w_1', [change], false);
    sink.release();
    sink.changes('w_1', [change], false);
    sink.changes('w_1', [change], true);

    expect(wire.sent.map((frame) => frame.seq)).toEqual([1, 2]);
    expect(wire.sent[0]).toMatchObject({
      kind: 'event',
      type: 'workspace.filesChanged',
      payload: { watchId: 'w_1', changes: [change] },
    });
    expect(wire.sent[0]?.payload).not.toHaveProperty('overflow');
    expect(wire.sent[0]?.sessionId).toBeUndefined();
    expect(wire.sent[1]?.payload).toMatchObject({ overflow: true });
  });

  it('keeps a stop that came before the ack, and sends it after — once', () => {
    sink.stopped('w_1', 'folderDeleted');
    sink.end();
    expect(wire.sent).toEqual([]);

    sink.release();
    sink.changes('w_1', [change], false);

    expect(wire.sent).toEqual([
      expect.objectContaining({
        type: 'workspace.watchStopped',
        seq: 1,
        payload: { watchId: 'w_1', reason: 'folderDeleted' },
      }),
    ]);
  });

  it('owes a socket that fell behind one overflow, and sends it when it caught up — S-155', () => {
    sink.release();
    wire.bufferedAmount = 101;

    sink.changes('w_1', [change], false);
    sink.changes('w_1', [change], false);
    expect(wire.sent).toEqual([]);
    expect(scheduler.delays).toEqual([CATCH_UP_INTERVAL_MS]);

    scheduler.fire();
    expect(wire.sent).toEqual([]);

    wire.bufferedAmount = 0;
    scheduler.fire();

    expect(wire.sent).toEqual([
      expect.objectContaining({ seq: 1, payload: { watchId: 'w_1', changes: [], overflow: true } }),
    ]);
    expect(log.withOp('files.watch')).toContainEqual(
      expect.objectContaining({ level: 'warn', watchId: 'w_1' }),
    );
  });

  it('pays what it owes with the next change when one comes first', () => {
    sink.release();
    wire.bufferedAmount = 500;
    sink.changes('w_1', [change], false);

    wire.bufferedAmount = 0;
    sink.changes('w_1', [change], false);
    scheduler.fire();

    expect(wire.sent).toEqual([
      expect.objectContaining({
        seq: 1,
        payload: { watchId: 'w_1', changes: [change], overflow: true },
      }),
    ]);
  });

  it('drops what it owes once its subscription ended', () => {
    sink.release();
    wire.bufferedAmount = 500;
    sink.changes('w_1', [change], false);

    sink.end();
    wire.bufferedAmount = 0;
    scheduler.fire();
    sink.changes('w_1', [change], false);

    expect(wire.sent).toEqual([]);
    expect(scheduler.armed).toBe(0);
  });

  it('sends nothing to a connection that is gone, and says it is closed', () => {
    sink.release();
    registry.remove('c1');

    sink.changes('w_1', [change], false);
    sink.stopped('w_1', 'allowlistChanged');

    expect(sink.open).toBe(false);
    expect(wire.sent).toEqual([]);
  });

  it('logs what it sent — counts and seq, never the paths — S-156', () => {
    sink.release();

    sink.changes('w_1', [change, change], false);

    const line = log.withOp('files.watch').at(-1);
    expect(line).toMatchObject({
      level: 'debug',
      connectionId: 'c1',
      watchId: 'w_1',
      seq: 1,
      changes: 2,
    });
    expect(JSON.stringify(line)).not.toContain('a.ts');
  });
});
