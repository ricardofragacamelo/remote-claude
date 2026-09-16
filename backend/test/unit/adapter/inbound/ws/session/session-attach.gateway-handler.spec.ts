import { beforeEach, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { SessionAttachHandler } from '@adapter/inbound/ws/session/session-attach.gateway-handler';
import type { WsCommandContext } from '@adapter/inbound/ws/ws-command';
import { AttachSessionUseCase } from '@application/session';
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

const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const owner = UserId.create('auth|owner');
const now = new Date('2026-09-13T12:00:00.000Z');

function frame(payload: unknown): Envelope {
  return {
    v: 1,
    id: 'cmd-1',
    kind: 'command',
    type: 'session.attach',
    ts: now.toISOString(),
    payload: payload as Readonly<Record<string, unknown>>,
  };
}

describe('SessionAttachHandler', () => {
  let sessions: InMemorySessionRepository;
  let hub: SessionHub;
  let handler: SessionAttachHandler;
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

  /** Publishes `count` events on the session, so there is something to replay. */
  const publish = (count: number): void => {
    for (let index = 0; index < count; index += 1) {
      hub.publish(SESSION, { type: 'session.pong', payload: { index } });
    }
  };

  beforeEach(() => {
    sessions = new InMemorySessionRepository();
    attached = [];
    hub = new SessionHub(
      new ConnectionRegistry(),
      new EventBuffer(3),
      new FrameBuilder(new FixedClock(now), new SequentialIds()),
      new RecordingLogger().logger,
    );
    handler = new SessionAttachHandler(new AttachSessionUseCase(sessions));
    sessions.seed(aSession());
  });

  it('attaches, and replays nothing when the client asks for no resume', async () => {
    publish(2);

    const outcome = await handler.handle(contextFor({ sessionId: SESSION }));

    expect(attached).toEqual([SESSION]);
    expect(outcome.ack).toEqual({
      type: 'session.attached',
      payload: { sessionId: SESSION, replayed: 0, oldestAvailableSeq: 1, gap: false },
    });
  });

  it('replays what came after the sequence the client already had', async () => {
    publish(3);

    const outcome = await handler.handle(contextFor({ sessionId: SESSION, resumeFromSeq: 1 }));

    expect(outcome.then.map((event) => event.seq)).toEqual([2, 3]);
    expect(outcome.ack.payload).toMatchObject({ replayed: 2, gap: false });
  });

  it('reports a gap when the client was away longer than the buffer holds', async () => {
    publish(10);

    const outcome = await handler.handle(contextFor({ sessionId: SESSION, resumeFromSeq: 1 }));

    expect(outcome.ack.payload).toMatchObject({ gap: true, replayed: 0, oldestAvailableSeq: 8 });
    expect(outcome.then).toEqual([]);
  });

  it.each([
    ['no payload', undefined],
    ['no session', {}],
    ['an empty session', { sessionId: '' }],
    ['a negative resume point', { sessionId: SESSION, resumeFromSeq: -1 }],
    ['a fractional resume point', { sessionId: SESSION, resumeFromSeq: 1.5 }],
  ])('refuses a frame with %s', async (_case, payload) => {
    await expect(handler.handle(contextFor(payload))).rejects.toThrow(InputValidationError);
  });

  it("refuses somebody else's session, and attaches nothing", async () => {
    const other = new SessionAttachHandler(
      new AttachSessionUseCase(new InMemorySessionRepository()),
    );

    await expect(other.handle(contextFor({ sessionId: SESSION }))).rejects.toThrow(
      SessionNotFoundError,
    );
    expect(attached).toEqual([]);
  });
});
