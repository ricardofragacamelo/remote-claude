import { describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import {
  sendAnswer,
  sendExtension,
  toExtension,
  toOutcome,
  toRequest,
} from '@/features/permission/services/permission.service';
import type { WsClient } from '@/shared/api/ws-client';

/** A client that records what was sent, instead of owning a socket. */
function aClient() {
  const commands: { type: string; payload: Readonly<Record<string, unknown>> }[] = [];
  const responses: {
    type: string;
    payload: Readonly<Record<string, unknown>>;
    correlationId: string;
  }[] = [];

  return {
    commands,
    responses,
    client: {
      command: (type: string, payload: Readonly<Record<string, unknown>>) => {
        commands.push({ type, payload });
        return true;
      },
      respond: (
        type: string,
        payload: Readonly<Record<string, unknown>>,
        correlationId: string,
      ) => {
        responses.push({ type, payload, correlationId });
        return true;
      },
    } as unknown as WsClient,
  };
}

function frame(overrides: Partial<Envelope>): Envelope {
  return {
    v: 1,
    id: 'frame-1',
    kind: 'event',
    type: 'permission.resolved',
    ts: '2026-09-19T12:00:00.000Z',
    ...overrides,
  } as Envelope;
}

describe('answering a permission request', () => {
  it('sends a response that names the request it answers', () => {
    const { client, responses } = aClient();

    sendAnswer(client, {
      requestId: 'req-1',
      frameId: 'frame-1',
      decision: 'allow',
      scope: 'session',
      reason: null,
    });

    expect(responses).toEqual([
      {
        type: 'permission.resolve',
        correlationId: 'frame-1',
        payload: { requestId: 'req-1', decision: 'allow', scope: 'session' },
      },
    ]);
  });

  it('carries the reason on a refusal, because the contract demands one', () => {
    const { client, responses } = aClient();

    sendAnswer(client, {
      requestId: 'req-1',
      frameId: 'frame-1',
      decision: 'deny',
      scope: 'once',
      reason: 'not now',
    });

    expect(responses[0]?.payload).toMatchObject({ reason: 'not now' });
  });

  it('asks for more time without choosing the number', () => {
    const { client, commands } = aClient();

    sendExtension(client, 'req-1');

    expect(commands).toEqual([{ type: 'permission.extend', payload: { requestId: 'req-1' } }]);
  });
});

describe('reading the permission frames', () => {
  it.each([
    ['a frame of another type', frame({ type: 'message.delta' })],
    ['a request with no payload at all', frame({ type: 'permission.requested' })],
  ])('reads %s as none of its business', (_case, given) => {
    expect(toRequest(given)).toBeNull();
    expect(toOutcome(frame({ type: 'message.delta', payload: {} }))).toBeNull();
    expect(toExtension(frame({ type: 'message.delta', payload: {} }))).toBeNull();
  });

  it('reads an outcome', () => {
    expect(
      toOutcome(frame({ payload: { requestId: 'req-1', decision: 'deny', auto: true } })),
    ).toEqual({ requestId: 'req-1', decision: 'deny', auto: true, resolvedBy: null });
  });

  it.each([
    ['no request id', { decision: 'allow', auto: false }],
    ['a decision this build does not know', { requestId: 'req-1', decision: 'maybe' }],
    ['no payload', undefined],
  ])('drops an outcome with %s', (_case, payload) => {
    expect(toOutcome(frame(payload === undefined ? {} : { payload }))).toBeNull();
  });

  it('reads an extension', () => {
    expect(
      toExtension(
        frame({
          type: 'permission.extended',
          payload: { requestId: 'req-1', expiresAt: '2026-09-19T12:05:00.000Z' },
        }),
      ),
    ).toEqual({ requestId: 'req-1', expiresAt: '2026-09-19T12:05:00.000Z' });
  });

  it.each([
    ['no deadline', { requestId: 'req-1' }],
    ['no request id', { expiresAt: '2026-09-19T12:05:00.000Z' }],
  ])('drops an extension with %s', (_case, payload) => {
    expect(toExtension(frame({ type: 'permission.extended', payload }))).toBeNull();
  });

  it('reads a request with no suggestions at all', () => {
    // The server always sends them today; a client that fell over when it did not would be a
    // client that breaks on a field becoming optional.
    const read = toRequest(
      frame({
        kind: 'request',
        type: 'permission.requested',
        payload: {
          requestId: 'req-1',
          toolName: 'Read',
          title: 'permission.tool.Read',
          input: { file_path: '/srv/app/main.ts' },
          riskHint: 'read',
          expiresAt: '2026-09-19T12:02:00.000Z',
        },
      }),
    );

    expect(read).toMatchObject({ suggestions: [], toolUseId: '', description: null, input: {} });
  });

  it('keeps an input it can read, and reads a missing one as empty', () => {
    const read = toRequest(
      frame({
        kind: 'request',
        type: 'permission.requested',
        payload: {
          requestId: 'req-1',
          toolName: 'Read',
          title: 'permission.tool.Read',
          input: 'not an object',
          riskHint: 'read',
          expiresAt: '2026-09-19T12:02:00.000Z',
        },
      }),
    );

    expect(read?.input).toEqual({});
  });
});

describe('the scopes a question offers — plan 03, D-12', () => {
  /** A question offering exactly [suggestions]. */
  function offering(suggestions: readonly unknown[]): ReturnType<typeof toRequest> {
    return toRequest(
      frame({
        kind: 'request',
        type: 'permission.requested',
        payload: {
          requestId: 'req-1',
          toolName: 'Bash',
          title: 'permission.tool.Bash',
          input: { command: 'git status' },
          riskHint: 'read',
          expiresAt: '2026-09-19T12:02:00.000Z',
          suggestions,
        },
      }),
    );
  }

  const ONE_DAY = 86_400_000;

  it('reads a persisted scope with the rule it would grant', () => {
    const read = offering([
      { scope: 'once', labelKey: 'permission.scope.once' },
      {
        scope: 'always',
        labelKey: 'permission.scope.always',
        pattern: 'Bash(git status)',
        lifetimeMs: ONE_DAY,
      },
    ]);

    expect(read?.suggestions).toEqual([
      { scope: 'once', labelKey: 'permission.scope.once', rule: null },
      {
        scope: 'always',
        labelKey: 'permission.scope.always',
        rule: { pattern: 'Bash(git status)', lifetimeMs: ONE_DAY },
      },
    ]);
  });

  it('says nothing about a rule on the scopes that die with the session', () => {
    // A pattern sent beside `session` by mistake is not a rule this screen should describe.
    const read = offering([
      { scope: 'session', labelKey: 'permission.scope.session', pattern: 'Bash(x)', lifetimeMs: 1 },
    ]);

    expect(read?.suggestions).toEqual([
      { scope: 'session', labelKey: 'permission.scope.session', rule: null },
    ]);
  });

  it.each([
    ['no pattern', { lifetimeMs: ONE_DAY }],
    ['no lifetime', { pattern: 'Bash(git status)' }],
    ['a lifetime that is not a number', { pattern: 'Bash(git status)', lifetimeMs: '90d' }],
    ['a fractional lifetime', { pattern: 'Bash(git status)', lifetimeMs: 1.5 }],
    ['a lifetime of zero', { pattern: 'Bash(git status)', lifetimeMs: 0 }],
  ])('does not offer a persisted scope with %s — S-67', (_case, rule) => {
    // "Don't ask again" without saying about what, or for how long, is the button R-02 is about.
    const read = offering([
      { scope: 'once', labelKey: 'permission.scope.once' },
      { scope: 'project', labelKey: 'permission.scope.project', ...rule },
    ]);

    expect(read?.suggestions.map((suggestion) => suggestion.scope)).toEqual(['once']);
  });

  it('drops a scope this build has never heard of', () => {
    const read = offering([{ scope: 'forever', labelKey: 'permission.scope.forever' }]);

    expect(read?.suggestions).toEqual([]);
  });
});
