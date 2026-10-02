import { describe, expect, it } from 'vitest';

import {
  FRAME_TYPES,
  PROTOCOL_VERSION,
  isWorkspaceFilesChangedPayload,
  isWorkspaceFilesChangedPayloadChangesItem,
  isWorkspaceWatchPayload,
  isWorkspaceWatchStoppedPayload,
  isWorkspaceWatchingPayload,
  isConnectionAuthenticateFrame,
  isConnectionReadyFrame,
  isEnvelope,
  isErrorPayload,
  isPermissionExtendPayload,
  isPermissionRequestedFrame,
  isPermissionResolvePayload,
  isMessageCompletedPayload,
  isMessageDeltaPayload,
  isPromptDequeuedPayload,
  isPromptQueuedPayload,
  isSessionCancelQueuedPromptPayload,
  isSessionCompactedPayload,
  isSessionPromptPayload,
  isSessionPromptPayloadAttachmentsItem,
  isSessionPromptPayloadAttachmentsItemRange,
  isSessionRejectChangePayload,
  isSessionRewindFilesPayload,
  isSessionStartPayload,
  isToolStartedPayload,
  SESSION_PROMPT_PAYLOAD_ATTACHMENTS_ITEM_LIMITS,
  SESSION_PROMPT_PAYLOAD_LIMITS,
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
      'prompt.dequeued',
      'prompt.queued',
      'session.attach',
      'session.attached',
      'session.cancelQueuedPrompt',
      'session.close',
      'session.closed',
      'session.compacted',
      'session.detach',
      'session.interrupt',
      'session.prompt',
      'session.rejectChange',
      'session.rewindFiles',
      'session.rewound',
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
      'workspace.filesChanged',
      'workspace.unwatch',
      'workspace.watch',
      'workspace.watchStopped',
      'workspace.watching',
    ]);
  });

  /** S-86 — the bootstrap's name is gone, not deprecated alongside the new one. */
  it('no longer carries the name the bootstrap used', () => {
    expect(FRAME_TYPES).not.toContain('session.ping');
    expect(FRAME_TYPES).not.toContain('session.pong');
  });

  /** Plan 04, S-45 — the undo is a command and its outcome an event, in the one contract. */
  it('carries the undo: session.rewindFiles and session.rewound', () => {
    expect(FRAME_TYPES).toContain('session.rewindFiles');
    expect(FRAME_TYPES).toContain('session.rewound');
  });

  /** Plan 07, S-01 — the stream of a folder's changes, as one contract for the three ends. */
  it('carries the watch of a folder: two commands, an ack and two events', () => {
    for (const type of [
      'workspace.watch',
      'workspace.unwatch',
      'workspace.watching',
      'workspace.filesChanged',
      'workspace.watchStopped',
    ]) {
      expect(FRAME_TYPES).toContain(type);
    }
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
          limits: {
            maxFrameBytes: 1_048_576,
            maxFramesPerSecond: 20,
            maxAttachedSessions: 16,
            replayBufferSize: 1_000,
          },
        },
      }),
    ).toBe(true);
  });

  it('rejects a handshake answer that does not announce every limit — plan 05, B-06', () => {
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
    ).toBe(false);
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

  it('rejects workspace.filesChanged with no seq, like every event — plan 07, S-02', () => {
    const changed = eventFrame({
      type: 'workspace.filesChanged',
      sessionId: undefined,
      seq: 1,
      payload: { watchId: 'w1', changes: [{ path: 'a.ts', kind: 'changed' }] },
    });

    expect(isEnvelope(JSON.parse(JSON.stringify(changed)))).toBe(true);
    expect(isEnvelope(without(JSON.parse(JSON.stringify(changed)), 'seq'))).toBe(false);
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

/**
 * Plan 07, S-01 — the payloads of the watch of a folder, as the generated guards read them.
 *
 * The client that asks to watch and the server that answers agree on the same shapes; a client
 * that never asks — the mobile app — has the types and never needs them.
 */
describe('the payloads of a watch of a folder', () => {
  it('needs the folder to watch', () => {
    expect(isWorkspaceWatchPayload({ workspacePath: '/srv/app' })).toBe(true);
    expect(isWorkspaceWatchPayload({})).toBe(false);
    expect(isWorkspaceWatchPayload({ workspacePath: 42 })).toBe(false);
  });

  it('names the subscription in the ack', () => {
    expect(isWorkspaceWatchingPayload({ watchId: 'w1', workspacePath: '/srv/app' })).toBe(true);
    expect(isWorkspaceWatchingPayload({ watchId: 'w1' })).toBe(false);
  });

  it('says each path, what happened to it and — when it can — who did it', () => {
    expect(
      isWorkspaceFilesChangedPayload({
        watchId: 'w1',
        changes: [
          { path: 'a.ts', kind: 'changed', origin: 'claude' },
          { path: 'b.ts', kind: 'deleted' },
        ],
        overflow: false,
      }),
    ).toBe(true);
    expect(isWorkspaceFilesChangedPayload({ watchId: 'w1' })).toBe(false);
    // The generator checks an array's items with their own guard, as a client reads them.
    expect(isWorkspaceFilesChangedPayloadChangesItem({ path: 'a.ts' })).toBe(false);
    expect(isWorkspaceFilesChangedPayloadChangesItem({ path: 'a.ts', kind: 'created' })).toBe(true);
  });

  it('says why a subscription ended', () => {
    expect(isWorkspaceWatchStoppedPayload({ watchId: 'w1', reason: 'folderDeleted' })).toBe(true);
    expect(isWorkspaceWatchStoppedPayload({ watchId: 'w1' })).toBe(false);
  });
});

/**
 * Plan 08, B-01 — the context of a prompt: a union by `kind`, whose obligations and bounds live in
 * the schema so that the TypeScript guard and the Dart predicates are the same rule.
 */
describe('the attachments of a prompt', () => {
  const prompt = (/** @type {unknown[]} */ attachments) => ({
    sessionId: 's',
    text: 'hi',
    attachments,
  });

  /** S-01 */
  it.each([
    ['a file', { kind: 'file', path: 'src/a.ts' }],
    ['a range of a file', { kind: 'file', path: 'src/a.ts', range: { startLine: 3, endLine: 9 } }],
    ['a folder', { kind: 'folder', path: 'src' }],
    ['an uploaded attachment', { kind: 'upload', attachmentId: 'att_1' }],
    ['text a provider holds', { kind: 'text', source: 'terminal', label: 'bash', content: '$ ls' }],
  ])('accepts %s', (_case, attachment) => {
    expect(isSessionPromptPayloadAttachmentsItem(attachment)).toBe(true);
    expect(isSessionPromptPayload(prompt([attachment]))).toBe(true);
  });

  /** S-02 */
  it('reads an attachment without a kind as the file it always was', () => {
    expect(
      isSessionPromptPayloadAttachmentsItem({ path: 'notes.md', mediaType: 'text/markdown' }),
    ).toBe(true);
    expect(isSessionPromptPayloadAttachmentsItem({ mediaType: 'text/markdown' })).toBe(false);
  });

  /** S-03 */
  it.each([
    ['a file without a path', { kind: 'file' }],
    ['a folder without a path', { kind: 'folder' }],
    ['an upload without its id', { kind: 'upload' }],
    ['text without content', { kind: 'text', source: 'terminal', label: 'bash' }],
    ['text without a source', { kind: 'text', label: 'bash', content: 'x' }],
    ['text without a label', { kind: 'text', source: 'terminal', content: 'x' }],
  ])('refuses %s', (_case, attachment) => {
    expect(isSessionPromptPayloadAttachmentsItem(attachment)).toBe(false);
  });

  /** S-04 — the floor of a line is the schema's; the order of two lines is the backend's. */
  it.each([
    ['a start at line 0', { startLine: 0, endLine: 3 }],
    ['a negative end', { startLine: 1, endLine: -2 }],
    ['a range with no end', { startLine: 1 }],
  ])('refuses %s', (_case, range) => {
    expect(isSessionPromptPayloadAttachmentsItemRange(range)).toBe(false);
  });

  /** S-05 */
  it('bounds the number of attachments, and says the bound', () => {
    const one = { kind: 'file', path: 'a' };
    const max = SESSION_PROMPT_PAYLOAD_LIMITS.attachments.maxItems;

    expect(isSessionPromptPayload(prompt(Array.from({ length: max }, () => one)))).toBe(true);
    expect(isSessionPromptPayload(prompt(Array.from({ length: max + 1 }, () => one)))).toBe(false);
  });

  /** S-06 */
  it('bounds the text a provider sends', () => {
    const max = SESSION_PROMPT_PAYLOAD_ATTACHMENTS_ITEM_LIMITS.content.maxLength;
    const text = (/** @type {number} */ length) => ({
      kind: 'text',
      source: 'terminal',
      label: 'bash',
      content: 'x'.repeat(length),
    });

    expect(isSessionPromptPayloadAttachmentsItem(text(max))).toBe(true);
    expect(isSessionPromptPayloadAttachmentsItem(text(max + 1))).toBe(false);
  });

  it('accepts a kind it has never heard of, like every enum at runtime', () => {
    expect(isSessionPromptPayloadAttachmentsItem({ kind: 'snippet', body: 'x' })).toBe(true);
  });
});

/**
 * Plan 08, B-02 — what the stream and the commands gained. Every field is optional or every type is
 * new, which is what keeps `v` at 1.
 */
describe('the stream and the commands of the panel', () => {
  /** S-07 */
  it('accepts a thinking delta, and a delta that names none, as before', () => {
    expect(isMessageDeltaPayload({ messageId: 'm', delta: 'hm', blockType: 'thinking' })).toBe(
      true,
    );
    expect(isMessageDeltaPayload({ messageId: 'm', delta: 'hi' })).toBe(true);
  });

  /** S-07 */
  it('accepts the subagent a message and a tool belong to', () => {
    expect(
      isMessageCompletedPayload({
        messageId: 'm',
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'hm' }, { type: 'redacted_thinking' }],
        parentToolUseId: 'toolu_task',
      }),
    ).toBe(true);
    expect(
      isToolStartedPayload({
        toolUseId: 't',
        toolName: 'Read',
        input: {},
        parentToolUseId: 'toolu_task',
      }),
    ).toBe(true);
  });

  /** S-07 */
  it('carries compaction and the queue as events of their own', () => {
    expect(isSessionCompactedPayload({ trigger: 'auto', preTokens: 180000 })).toBe(true);
    expect(isSessionCompactedPayload({})).toBe(false);
    expect(
      isPromptQueuedPayload({ queueId: 'q', position: 1, promptedBy: 'u', preview: 'next' }),
    ).toBe(true);
    expect(isPromptQueuedPayload({ queueId: 'q', position: 1, promptedBy: 'u' })).toBe(false);
    expect(isPromptDequeuedPayload({ queueId: 'q', reason: 'cancelled' })).toBe(true);
  });

  /** S-08 */
  it('refuses a fork point without the conversation it belongs to', () => {
    expect(isSessionStartPayload({ workspacePath: '/w', forkAt: 'msg' })).toBe(false);
    expect(
      isSessionStartPayload({ workspacePath: '/w', forkAt: 'msg', resumeSessionId: 'c' }),
    ).toBe(true);
    expect(isSessionStartPayload({ workspacePath: '/w' })).toBe(true);
  });

  it('carries the commands of the queue and the rejection, and the effort of a start', () => {
    expect(isSessionCancelQueuedPromptPayload({ sessionId: 's', queueId: 'q' })).toBe(true);
    expect(isSessionCancelQueuedPromptPayload({ sessionId: 's' })).toBe(false);
    expect(isSessionStartPayload({ workspacePath: '/w', effort: 'low' })).toBe(true);
    expect(
      isSessionRejectChangePayload({ sessionId: 's', path: 'a.ts', hunkId: 'h1', revision: 'r' }),
    ).toBe(true);
    expect(isSessionRejectChangePayload({ sessionId: 's', path: 'a.ts', hunkId: 'h1' })).toBe(
      false,
    );
    expect(isSessionRewindFilesPayload({ sessionId: 's', promptId: 'p', paths: ['a.ts'] })).toBe(
      true,
    );
  });
});
