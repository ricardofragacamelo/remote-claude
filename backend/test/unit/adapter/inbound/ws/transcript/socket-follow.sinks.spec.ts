import { beforeEach, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { SocketFollowSinks } from '@adapter/inbound/ws/transcript/socket-follow.sinks';
import type { SocketFollowSink } from '@adapter/inbound/ws/transcript/socket-follow.sinks';
import { ConnectionRegistry } from '@infra/websocket/connection-registry';
import type { Sendable } from '@infra/websocket/connection-registry';
import { EventBuffer } from '@infra/websocket/event-buffer';
import { FrameBuilder } from '@infra/websocket/frame-builder';
import { SessionHub } from '@infra/websocket/session-hub';
import { FixedClock } from '../../../../../support/fakes/fixed-clock';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';
import { SequentialIds } from '../../../../../support/fakes/sequential-ids';

/** A socket that keeps what it was sent. */
function socket(): Sendable & { sent: Envelope[] } {
  const sent: Envelope[] = [];
  return {
    sent,
    send: (data: string) => sent.push(JSON.parse(data) as Envelope),
    close: () => undefined,
  };
}

const update = {
  events: [
    {
      type: 'message.completed',
      payload: {
        messageId: 'm2',
        role: 'assistant',
        content: [{ type: 'text', text: 'private words' }],
      },
    },
  ],
  lastMessageId: 'm2',
  activity: 'activeElsewhere' as const,
  working: true,
};

describe('SocketFollowSink — the stream of one followId — plan 22, B-17', () => {
  let registry: ConnectionRegistry;
  let log: RecordingLogger;
  let wire: ReturnType<typeof socket>;
  let sink: SocketFollowSink;

  beforeEach(() => {
    registry = new ConnectionRegistry();
    log = new RecordingLogger();
    wire = socket();
    registry.register('c1', wire);
    const frames = new FrameBuilder(new FixedClock(new Date(0)), new SequentialIds());

    sink = new SocketFollowSinks({
      registry,
      frames,
      hub: new SessionHub(registry, new EventBuffer(), frames, log.logger),
      logger: log.logger,
    }).open('c1');
  });

  it('numbers its own stream from 1, with no session, and the reset last — S-65', () => {
    sink.appended('t_1', 'conv', update);
    sink.appended('t_1', 'conv', { ...update, events: [], lastMessageId: null, working: false });
    sink.reset('t_1', 'conv', 'rewritten');

    expect(wire.sent.map((frame) => [frame.type, frame.seq])).toEqual([
      ['transcript.appended', 1],
      ['transcript.appended', 2],
      ['transcript.reset', 3],
    ]);
    expect(wire.sent[0]).toMatchObject({
      kind: 'event',
      payload: {
        followId: 't_1',
        conversationId: 'conv',
        lastMessageId: 'm2',
        activity: 'activeElsewhere',
        working: true,
      },
    });
    expect(wire.sent[0]?.sessionId).toBeUndefined();
    expect(wire.sent[1]?.payload).not.toHaveProperty('lastMessageId');
    expect(wire.sent[2]?.payload).toEqual({
      followId: 't_1',
      conversationId: 'conv',
      reason: 'rewritten',
    });
  });

  it('logs how many events went, never what they say — S-72', () => {
    sink.appended('t_1', 'conv', update);

    expect(log.withOp('transcript.follow')).toEqual([
      expect.objectContaining({
        level: 'debug',
        followId: 't_1',
        seq: 1,
        events: 1,
        working: true,
      }),
    ]);
    expect(JSON.stringify(log.lines)).not.toContain('private words');
  });

  it('sends nothing once ended, or once the socket is gone — S-68', () => {
    expect(sink.open).toBe(true);
    sink.end();
    sink.appended('t_1', 'conv', update);
    expect(wire.sent).toEqual([]);

    registry.remove('c1');
    expect(sink.open).toBe(false);
  });

  it('sends nothing to a connection that left, and does not throw', () => {
    registry.remove('c1');

    expect(() => {
      sink.reset('t_1', 'conv', 'gone');
    }).not.toThrow();
    expect(wire.sent).toEqual([]);
  });
});
