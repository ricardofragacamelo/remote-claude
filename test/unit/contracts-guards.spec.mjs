import { describe, expect, it } from 'vitest';

import {
  FRAME_TYPES,
  PROTOCOL_VERSION,
  isConnectionAuthenticateFrame,
  isConnectionReadyFrame,
  isEnvelope,
  isErrorPayload,
  isPermissionExtendPayload,
  isPermissionRequestedFrame,
  isPermissionResolvePayload,
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

  it('lists every frame type of the contract', () => {
    expect([...FRAME_TYPES].sort()).toEqual([
      'command.accepted',
      'connection.authenticate',
      'connection.ready',
      'connection.reauthenticate',
      'diag.ping',
      'diag.pong',
      'error',
      'message.completed',
      'message.delta',
      'permission.extend',
      'permission.extended',
      'permission.requested',
      'permission.resolve',
      'permission.resolved',
      'session.attach',
      'session.attached',
      'session.close',
      'session.closed',
      'session.detach',
      'session.interrupt',
      'session.prompt',
      'session.setLocale',
      'session.setModel',
      'session.setPermissionMode',
      'session.start',
      'session.started',
      'session.statusChanged',
      'tool.completed',
      'tool.progress',
      'tool.started',
      'turn.completed',
    ]);
  });

  /** S-86 — the bootstrap's name is gone, not deprecated alongside the new one. */
  it('no longer carries the name the bootstrap used', () => {
    expect(FRAME_TYPES).not.toContain('session.ping');
    expect(FRAME_TYPES).not.toContain('session.pong');
  });

  /** S-01 — the command the web client has been sending since the walking skeleton. */
  it('carries session.detach, the debt the bootstrap left open', () => {
    expect(FRAME_TYPES).toContain('session.detach');
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

/**
 * S-03 — `seq` is mandatory on every `event`.
 *
 * It is the envelope's own rule, declared as `x-required-when` in the schema and generated into
 * both the TypeScript guard and the Dart predicate. Replay is built on `seq`: an event without one
 * is a hole that nothing downstream can detect afterwards, so the contract charges it at the edge
 * rather than trusting whoever emits.
 */
describe('the envelope requires seq on an event, and only on an event', () => {
  /** @param {Record<string, unknown>} overrides */
  const eventFrame = (overrides = {}) => ({
    v: 1,
    id: '01J',
    kind: 'event',
    type: 'diag.pong',
    ts: 'now',
    sessionId: 'sess_1',
    seq: 7,
    ...overrides,
  });

  it('accepts an event carrying seq', () => {
    expect(isEnvelope(eventFrame())).toBe(true);
  });

  it('rejects an event with no seq', () => {
    expect(isEnvelope(without(eventFrame(), 'seq'))).toBe(false);
  });

  it('rejects an event whose seq is not a number', () => {
    expect(isEnvelope(eventFrame({ seq: '7' }))).toBe(false);
  });

  it('accepts seq zero, which is a sequence and not an absence', () => {
    expect(isEnvelope(eventFrame({ seq: 0 }))).toBe(true);
  });

  it('asks for no seq on an ack', () => {
    expect(isEnvelope({ v: 1, id: '01J', kind: 'ack', type: 'connection.ready', ts: 'now' })).toBe(
      true,
    );
  });

  it('asks for no seq on a command, a request, a response or an error', () => {
    for (const kind of ['command', 'request', 'response', 'error']) {
      expect(isEnvelope({ v: 1, id: '01J', kind, type: 'whatever', ts: 'now' })).toBe(true);
    }
  });
});

/**
 * S-05 — `reason` is mandatory when the decision is `deny`.
 *
 * Conditional in the schema rather than validation scattered across three ends: the reason goes
 * into the audit trail and back to Claude as a message, and a rule written once per language is a
 * rule that holds in two of them.
 */
describe('isPermissionResolvePayload', () => {
  it('accepts an allow with no reason', () => {
    expect(isPermissionResolvePayload({ requestId: 'req_1', decision: 'allow' })).toBe(true);
  });

  it('accepts a deny carrying its reason', () => {
    expect(
      isPermissionResolvePayload({ requestId: 'req_1', decision: 'deny', reason: 'not this path' }),
    ).toBe(true);
  });

  it('rejects a deny with no reason', () => {
    expect(isPermissionResolvePayload({ requestId: 'req_1', decision: 'deny' })).toBe(false);
  });

  it('rejects a deny whose reason is not a string', () => {
    expect(isPermissionResolvePayload({ requestId: 'req_1', decision: 'deny', reason: 7 })).toBe(
      false,
    );
  });

  it('rejects a resolution with no requestId — idempotency has nothing to key on', () => {
    expect(isPermissionResolvePayload({ decision: 'allow' })).toBe(false);
  });

  it('accepts a scope it has never heard of, like every other enum at runtime', () => {
    expect(
      isPermissionResolvePayload({ requestId: 'req_1', decision: 'allow', scope: 'fortnight' }),
    ).toBe(true);
  });
});

/** S-87 — the extend command carries the request and nothing else. */
describe('isPermissionExtendPayload', () => {
  it('accepts an extension naming its request', () => {
    expect(isPermissionExtendPayload({ requestId: 'req_1' })).toBe(true);
  });

  it('rejects an extension with no requestId', () => {
    expect(isPermissionExtendPayload({})).toBe(false);
  });

  it('ignores an increment the client tried to choose — the number is the backend’s', () => {
    expect(isPermissionExtendPayload({ requestId: 'req_1', byMs: 600_000 })).toBe(true);
  });
});

/**
 * The one `request` that travels server to client. Its `kind` is what the whole protocol was
 * designed around, so the guard has to hold it apart from an event.
 */
describe('isPermissionRequestedFrame', () => {
  /** @param {Record<string, unknown>} overrides */
  const requested = (overrides = {}) => ({
    v: 1,
    id: '01J',
    kind: 'request',
    type: 'permission.requested',
    ts: 'now',
    sessionId: 'sess_1',
    payload: {
      requestId: 'req_1',
      toolUseId: 'toolu_1',
      toolName: 'Bash',
      title: 'Run shell command',
      input: { command: 'rm -rf build/' },
      riskHint: 'destructive',
      defaultToNo: true,
      expiresAt: '2026-09-13T12:02:00.000Z',
    },
    ...overrides,
  });

  it('accepts the request as the backend sends it', () => {
    expect(isPermissionRequestedFrame(requested())).toBe(true);
  });

  it('needs no seq, because a request is not an event', () => {
    expect(isPermissionRequestedFrame(requested())).toBe(true);
  });

  it('rejects it when the deadline is missing — ours is the only timeout there is', () => {
    const frame = requested();
    expect(
      isPermissionRequestedFrame({ ...frame, payload: without(frame.payload, 'expiresAt') }),
    ).toBe(false);
  });

  it('rejects it when riskHint is missing, rather than letting the UI guess', () => {
    const frame = requested();
    expect(
      isPermissionRequestedFrame({ ...frame, payload: without(frame.payload, 'riskHint') }),
    ).toBe(false);
  });

  it('rejects the same payload sent as an event', () => {
    expect(isPermissionRequestedFrame(requested({ kind: 'event', seq: 1 }))).toBe(false);
  });
});
