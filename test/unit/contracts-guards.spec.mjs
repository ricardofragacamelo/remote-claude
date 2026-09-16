import { describe, expect, it } from 'vitest';

import {
  FRAME_TYPES,
  PROTOCOL_VERSION,
  isConnectionAuthenticateFrame,
  isConnectionReadyFrame,
  isEnvelope,
  isErrorPayload,
} from '../../packages/contracts/src/index.js';

/**
 * The generated guards, exercised as a client would.
 *
 * The rule they exist to hold up: a frame carrying a field this build has never heard of is
 * **accepted**. Rejecting it would make every added field a breaking change for an app already
 * published to a store (docs/architecture/shared/05-websocket-protocol.md).
 */

/** @param {Record<string, unknown>} overrides */
function authenticateFrame(overrides = {}) {
  return {
    v: 1,
    id: '01JABCDEF0123456789ABCDEFG',
    kind: 'command',
    type: 'connection.authenticate',
    ts: '2026-09-13T12:00:00.000Z',
    traceId: '9f2c1e5a-0000-4000-8000-000000000000',
    payload: {
      token: 'a.b.c',
      locale: 'pt-BR',
      client: { kind: 'web', version: '0.1.0' },
    },
    ...overrides,
  };
}

/**
 * A copy of `frame` without one field, for the "required field missing" cases.
 *
 * @param {Record<string, unknown>} frame
 * @param {string} field
 * @returns {Record<string, unknown>}
 */
function without(frame, field) {
  return Object.fromEntries(Object.entries(frame).filter(([name]) => name !== field));
}

describe('the generated protocol surface', () => {
  it('pins the version the envelope requires', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('lists the frame types of the walking skeleton', () => {
    expect([...FRAME_TYPES].sort()).toEqual([
      'command.accepted',
      'connection.authenticate',
      'connection.ready',
      'connection.reauthenticate',
      'error',
      'session.attach',
      'session.attached',
      'session.ping',
      'session.pong',
    ]);
  });
});

describe('isEnvelope', () => {
  it('accepts a well-formed frame', () => {
    expect(isEnvelope(authenticateFrame())).toBe(true);
  });

  it('accepts a frame carrying a field it has never heard of', () => {
    expect(isEnvelope(authenticateFrame({ tenantId: 'added-in-a-later-release' }))).toBe(true);
  });

  it('accepts a frame with no optional fields at all', () => {
    expect(isEnvelope({ v: 1, id: 'x', kind: 'ack', type: 'connection.ready', ts: 'now' })).toBe(
      true,
    );
  });

  it('rejects a frame missing a required field', () => {
    expect(isEnvelope(without(authenticateFrame(), 'id'))).toBe(false);
  });

  it('rejects a frame whose required field has the wrong type', () => {
    expect(isEnvelope(authenticateFrame({ ts: 1_757_764_800_000 }))).toBe(false);
  });

  it('rejects a version this build does not speak', () => {
    expect(isEnvelope(authenticateFrame({ v: 2 }))).toBe(false);
  });

  it('rejects what is not an object at all', () => {
    for (const value of [null, undefined, 'frame', 42, []]) {
      expect(isEnvelope(value)).toBe(false);
    }
  });
});

describe('isConnectionAuthenticateFrame', () => {
  it('accepts the handshake command', () => {
    expect(isConnectionAuthenticateFrame(authenticateFrame())).toBe(true);
  });

  it('accepts a locale this build has never seen — the enum is not closed at runtime', () => {
    const frame = authenticateFrame();
    const payload = { ...frame.payload, locale: 'ja-JP' };

    expect(isConnectionAuthenticateFrame({ ...frame, payload })).toBe(true);
  });

  it('accepts an unknown field inside the payload too', () => {
    const frame = authenticateFrame();
    const payload = { ...frame.payload, deviceId: 'added-later' };

    expect(isConnectionAuthenticateFrame({ ...frame, payload })).toBe(true);
  });

  it('rejects a payload missing a required field', () => {
    const frame = authenticateFrame();
    const payload = without(frame.payload, 'token');

    expect(isConnectionAuthenticateFrame({ ...frame, payload })).toBe(false);
  });

  it('rejects a payload whose nested object is missing a required field', () => {
    const frame = authenticateFrame();
    const payload = { ...frame.payload, client: { version: '0.1.0' } };

    expect(isConnectionAuthenticateFrame({ ...frame, payload })).toBe(false);
  });

  it('rejects a frame of the right kind but the wrong type', () => {
    expect(
      isConnectionAuthenticateFrame(authenticateFrame({ type: 'connection.reauthenticate' })),
    ).toBe(false);
  });

  it('rejects a frame of the right type but the wrong kind', () => {
    expect(isConnectionAuthenticateFrame(authenticateFrame({ kind: 'event' }))).toBe(false);
  });

  it('rejects a frame with no payload', () => {
    expect(isConnectionAuthenticateFrame(without(authenticateFrame(), 'payload'))).toBe(false);
  });
});

describe('isConnectionReadyFrame', () => {
  it('accepts the handshake answer, which is an ack and not an event', () => {
    expect(
      isConnectionReadyFrame({
        v: 1,
        id: '01J',
        kind: 'ack',
        type: 'connection.ready',
        ts: 'now',
        correlationId: '01I',
        payload: {
          connectionId: 'conn_1',
          serverVersion: '0.1.0',
          limits: { maxFrameBytes: 1_048_576, replayBufferSize: 1_000 },
        },
      }),
    ).toBe(true);
  });

  it('rejects it when the nested limits are missing', () => {
    expect(
      isConnectionReadyFrame({
        v: 1,
        id: '01J',
        kind: 'ack',
        type: 'connection.ready',
        ts: 'now',
        payload: { connectionId: 'conn_1', serverVersion: '0.1.0' },
      }),
    ).toBe(false);
  });
});

describe('isErrorPayload', () => {
  it('accepts an error carrying code, messageKey and traceId', () => {
    expect(
      isErrorPayload({
        code: 'UNAUTHENTICATED',
        messageKey: 'auth.error.unauthenticated',
        traceId: '9f2c1e5a',
      }),
    ).toBe(true);
  });

  it('accepts the optional validation details', () => {
    expect(
      isErrorPayload({
        code: 'INVALID_INPUT',
        messageKey: 'common.error.invalidInput',
        traceId: '9f2c',
        details: [{ field: 'workspacePath', rule: 'mustBeAbsolute' }],
      }),
    ).toBe(true);
  });

  it('rejects an error with no traceId — nobody could find it in the log', () => {
    expect(isErrorPayload({ code: 'X', messageKey: 'y' })).toBe(false);
  });
});
