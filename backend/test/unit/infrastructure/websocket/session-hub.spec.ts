import { beforeEach, describe, expect, it } from 'vitest';

import { ConnectionRegistry } from '@infra/websocket/connection-registry';
import type { Sendable } from '@infra/websocket/connection-registry';
import { EventBuffer } from '@infra/websocket/event-buffer';
import { FrameBuilder } from '@infra/websocket/frame-builder';
import { SessionHub } from '@infra/websocket/session-hub';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { RecordingLogger } from '../../../support/fakes/recording-logger';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

/** A socket that keeps what it was sent. */
function spySocket(): Sendable & { sent: string[] } {
  const sent: string[] = [];
  return { sent, send: (data: string) => sent.push(data), close: () => undefined };
}

describe('SessionHub', () => {
  let registry: ConnectionRegistry;
  let buffer: EventBuffer;
  let log: RecordingLogger;
  let hub: SessionHub;

  beforeEach(() => {
    registry = new ConnectionRegistry();
    buffer = new EventBuffer(3);
    log = new RecordingLogger();
    hub = new SessionHub(
      registry,
      buffer,
      new FrameBuilder(new FixedClock(new Date('2026-09-13T12:00:00.000Z')), new SequentialIds()),
      log.logger,
    );
  });

  it('numbers the first event of a session 1', () => {
    expect(hub.publish('s1', { type: 'diag.pong', payload: {} }).seq).toBe(1);
  });

  it('numbers strictly upwards, per session', () => {
    const first = hub.publish('s1', { type: 'diag.pong', payload: {} });
    const other = hub.publish('s2', { type: 'diag.pong', payload: {} });
    const second = hub.publish('s1', { type: 'diag.pong', payload: {} });

    expect([first.seq, second.seq]).toEqual([1, 2]);
    expect(other.seq).toBe(1);
  });

  it('never hands out the same sequence twice under concurrent publication', () => {
    const seqs = Array.from(
      { length: 200 },
      () => hub.publish('s1', { type: 'diag.pong', payload: {} }).seq,
    );

    expect(new Set(seqs).size).toBe(200);
    expect(seqs).toEqual([...seqs].sort((a, b) => Number(a) - Number(b)));
  });

  it('reaches every connection watching the session', () => {
    const watching = spySocket();
    const alsoWatching = spySocket();
    const elsewhere = spySocket();
    registry.register('c1', watching).attached.add('s1');
    registry.register('c2', alsoWatching).attached.add('s1');
    registry.register('c3', elsewhere).attached.add('s2');

    hub.publish('s1', { type: 'diag.pong', payload: {} });

    expect(watching.sent).toHaveLength(1);
    expect(alsoWatching.sent).toHaveLength(1);
    expect(elsewhere.sent).toHaveLength(0);
  });

  it('keeps the event for replay even when nobody is watching', () => {
    hub.publish('s1', { type: 'diag.pong', payload: {} });

    expect(hub.replay('s1', 0).events).toHaveLength(1);
  });

  it('does not let a dead socket hold up the publication', () => {
    const dead: Sendable = {
      send: () => {
        throw new Error('socket closed');
      },
      close: () => undefined,
    };
    const alive = spySocket();
    registry.register('c1', dead).attached.add('s1');
    registry.register('c2', alive).attached.add('s1');

    expect(() => hub.publish('s1', { type: 'diag.pong', payload: {} })).not.toThrow();
    expect(alive.sent).toHaveLength(1);
  });

  it('drops the connection whose send failed, and says so', () => {
    const dead: Sendable = {
      send: () => {
        throw new Error('socket closed');
      },
      close: () => undefined,
    };
    registry.register('c1', dead).attached.add('s1');

    hub.publish('s1', { type: 'diag.pong', payload: {} });

    expect(registry.get('c1')).toBeNull();
    expect(log.withOp('ws.outbound').some((line) => line['level'] === 'warn')).toBe(true);
  });

  it('logs the outbound edge with the sequence it sent', () => {
    const socket = spySocket();
    registry.register('c1', socket).attached.add('s1');

    hub.publish('s1', { type: 'diag.pong', payload: { nonce: 'n' } });

    expect(log.withOp('ws.outbound')[0]).toMatchObject({ connectionId: 'c1', seq: 1 });
  });

  it('never writes a token that travels in a frame', () => {
    const socket = spySocket();
    const connection = registry.register('c1', socket);

    hub.deliver(
      connection,
      new FrameBuilder(
        new FixedClock(new Date('2026-09-13T12:00:00.000Z')),
        new SequentialIds(),
      ).build({ kind: 'ack', type: 'connection.ready', payload: { token: 'super-secret' } }),
    );

    expect(JSON.stringify(log.lines)).not.toContain('super-secret');
    expect(socket.sent[0]).toContain('super-secret');
  });

  it('answers a replay request out of the buffer', () => {
    hub.publish('s1', { type: 'diag.pong', payload: {} });
    hub.publish('s1', { type: 'diag.pong', payload: {} });

    expect(hub.replay('s1', 1).events.map((frame) => frame.seq)).toEqual([2]);
  });

  it('delivers a frame to one connection on request', () => {
    const socket = spySocket();
    const connection = registry.register('c1', socket);
    const frame = hub.publish('s1', { type: 'diag.pong', payload: {} });

    hub.deliver(connection, frame);

    expect(socket.sent).toHaveLength(1);
  });

  it('does not lose the log line when the payload is enormous', () => {
    const socket = spySocket();
    registry.register('c1', socket).attached.add('s1');

    hub.publish('s1', { type: 'diag.pong', payload: { blob: 'x'.repeat(20_000) } });

    expect(log.withOp('ws.outbound')[0]).toMatchObject({ truncated: true });
  });
});
