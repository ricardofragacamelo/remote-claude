import { describe, expect, it } from 'vitest';

import { FrameBuilder } from '@infra/websocket/frame-builder';
import { SessionNotFoundError } from '@domain/session';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const now = new Date('2026-09-13T12:00:00.000Z');

function builder(): FrameBuilder {
  return new FrameBuilder(new FixedClock(now), new SequentialIds());
}

describe('FrameBuilder', () => {
  it('stamps the version, an id and the instant on every frame', () => {
    const frame = builder().build({ kind: 'ack', type: 'command.accepted', payload: {} });

    expect(frame.v).toBe(1);
    expect(frame.id).toMatch(/^01J/);
    expect(frame.ts).toBe('2026-09-13T12:00:00.000Z');
  });

  it('gives every frame a different id', () => {
    const frames = builder();

    expect(frames.build({ kind: 'ack', type: 'a', payload: {} }).id).not.toBe(
      frames.build({ kind: 'ack', type: 'a', payload: {} }).id,
    );
  });

  it('leaves out the optional fields that were not asked for', () => {
    const frame = builder().build({ kind: 'event', type: 'session.pong', payload: {} });

    expect(frame).not.toHaveProperty('traceId');
    expect(frame).not.toHaveProperty('correlationId');
    expect(frame).not.toHaveProperty('sessionId');
    expect(frame).not.toHaveProperty('seq');
  });

  it('carries the optional fields it was given', () => {
    const frame = builder().build({
      kind: 'event',
      type: 'session.pong',
      payload: { a: 1 },
      traceId: 't',
      correlationId: 'c',
      sessionId: 's',
      seq: 7,
    });

    expect(frame).toMatchObject({ traceId: 't', correlationId: 'c', sessionId: 's', seq: 7 });
  });

  it('builds an error frame in the envelope every other error uses', () => {
    const frame = builder().error(new SessionNotFoundError('01J0'), 'trace-1', 'cmd-1');

    expect(frame.kind).toBe('error');
    expect(frame.type).toBe('error');
    expect(frame.correlationId).toBe('cmd-1');
    expect(frame.payload).toMatchObject({
      code: 'SESSION_NOT_FOUND',
      messageKey: 'session.error.notFound',
      traceId: 'trace-1',
      httpEquivalent: 404,
    });
  });

  it('builds an error frame without a correlation when there is nothing to correlate with', () => {
    const frame = builder().error(new Error('boom'), 'trace-1');

    expect(frame).not.toHaveProperty('correlationId');
    expect(frame.payload).toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
