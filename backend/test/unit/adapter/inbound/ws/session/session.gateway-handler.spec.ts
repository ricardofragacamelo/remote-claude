import { beforeEach, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { SessionPingHandler } from '@adapter/inbound/ws/session/session.gateway-handler';
import type { WsCommandContext } from '@adapter/inbound/ws/ws-command';
import { PingSessionUseCase } from '@application/session';
import { UserId } from '@domain/auth';
import { SessionNotFoundError } from '@domain/session';
import { ConnectionRegistry } from '@infra/websocket/connection-registry';
import { EventBuffer } from '@infra/websocket/event-buffer';
import { FrameBuilder } from '@infra/websocket/frame-builder';
import { SessionHub } from '@infra/websocket/session-hub';
import { InputValidationError } from '@shared/errors/input-validation.error';
import { aSession } from '../../../../../support/builders/session.builder';
import { FixedClock } from '../../../../../support/fakes/fixed-clock';
import { InMemorySessionRepository } from '../../../../../support/fakes/in-memory-session.repository';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';
import { SequentialIds } from '../../../../../support/fakes/sequential-ids';

const owner = UserId.create('auth|owner');
const now = new Date('2026-09-13T12:00:00.000Z');

/** A command frame carrying `payload`. */
function frame(payload: unknown): Envelope {
  return {
    v: 1,
    id: 'cmd-1',
    kind: 'command',
    type: 'session.ping',
    ts: now.toISOString(),
    traceId: 'trace-1',
    payload: payload as Readonly<Record<string, unknown>>,
  };
}

describe('SessionPingHandler', () => {
  let sessions: InMemorySessionRepository;
  let buffer: EventBuffer;
  let hub: SessionHub;
  let handler: SessionPingHandler;
  let attached: string[];

  const contextFor = (payload: unknown): WsCommandContext => ({
    connectionId: 'c1',
    userId: owner,
    locale: 'en',
    frame: frame(payload),
    attach: (sessionId) => attached.push(sessionId),
    replay: (sessionId, resumeFromSeq) => hub.replay(sessionId, resumeFromSeq),
    publish: (sessionId, event) => {
      hub.publish(sessionId, event);
    },
  });

  beforeEach(() => {
    sessions = new InMemorySessionRepository();
    buffer = new EventBuffer(10);
    attached = [];
    hub = new SessionHub(
      new ConnectionRegistry(),
      buffer,
      new FrameBuilder(new FixedClock(now), new SequentialIds()),
      new RecordingLogger().logger,
    );
    handler = new SessionPingHandler(
      new PingSessionUseCase(sessions, new FixedClock(now), new SequentialIds()),
    );
  });

  it('answers an ack that says the command was accepted, not finished', async () => {
    const outcome = await handler.handle(contextFor({ nonce: 'n' }));

    expect(outcome.ack).toEqual({
      type: 'command.accepted',
      payload: { command: 'session.ping' },
    });
    expect(outcome.then).toEqual([]);
  });

  it('publishes nothing until the gateway has sent the ack', async () => {
    await handler.handle(contextFor({ nonce: 'n' }));

    expect(buffer.since(attached[0] ?? '', 0).events).toEqual([]);
  });

  it('publishes the pong as an event, numbered by the hub', async () => {
    (await handler.handle(contextFor({ nonce: 'n' }))).publish();

    const published = buffer.since(attached[0] ?? '', 0).events[0];
    expect(published).toMatchObject({
      kind: 'event',
      type: 'session.pong',
      seq: 1,
      correlationId: 'cmd-1',
      traceId: 'trace-1',
    });
  });

  it('echoes the nonce and reports the instant from the clock', async () => {
    (await handler.handle(contextFor({ nonce: 'mine' }))).publish();

    expect(buffer.since(attached[0] ?? '', 0).events[0]?.payload).toMatchObject({
      nonce: 'mine',
      pingedAt: '2026-09-13T12:00:00.000Z',
      pingCount: 1,
    });
  });

  it('attaches the caller, so it receives the event it asked for', async () => {
    await handler.handle(contextFor({ nonce: 'n' }));

    expect(attached).toHaveLength(1);
  });

  it('pings a session that already exists', async () => {
    sessions.seed(aSession({ pingCount: 2 }));

    (
      await handler.handle(contextFor({ sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ', nonce: 'n' }))
    ).publish();

    expect(buffer.since('01J0ABCDEFGHJKMNPQRSTVWXYZ', 0).events[0]?.payload).toMatchObject({
      pingCount: 3,
    });
  });

  it('numbers consecutive pongs of one session strictly upwards', async () => {
    sessions.seed(aSession());

    for (const nonce of ['a', 'b']) {
      (
        await handler.handle(contextFor({ sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ', nonce }))
      ).publish();
    }

    expect(buffer.since('01J0ABCDEFGHJKMNPQRSTVWXYZ', 0).events.map((event) => event.seq)).toEqual([
      1, 2,
    ]);
  });

  it.each([
    ['no payload at all', undefined],
    ['no nonce', {}],
    ['an empty nonce', { nonce: '' }],
    ['a nonce that is not a string', { nonce: 7 }],
  ])('refuses a frame with %s', async (_case, payload) => {
    await expect(handler.handle(contextFor(payload))).rejects.toThrow(InputValidationError);
  });

  it('refuses a session that does not exist, and publishes nothing', async () => {
    await expect(
      handler.handle(contextFor({ sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ', nonce: 'n' })),
    ).rejects.toThrow(SessionNotFoundError);

    expect(attached).toEqual([]);
  });
});
