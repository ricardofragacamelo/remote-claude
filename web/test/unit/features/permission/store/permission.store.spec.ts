import { beforeEach, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { usePermissionQueueStore } from '@/features/permission';

const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const EXPIRES = '2026-09-19T12:02:00.000Z';

/** The question, as the server asks it: a `request` frame, carrying no sequence. */
function requested(overrides: Record<string, unknown> = {}): Envelope {
  return {
    v: 1,
    id: 'frame-1',
    kind: 'request',
    type: 'permission.requested',
    ts: '2026-09-19T12:00:00.000Z',
    sessionId: SESSION,
    payload: {
      requestId: 'req-1',
      toolUseId: 'toolu-1',
      toolName: 'Bash',
      title: 'permission.tool.Bash',
      description: 'rm -rf build/',
      input: { command: 'rm -rf build/' },
      riskHint: 'destructive',
      defaultToNo: true,
      expiresAt: EXPIRES,
      suggestions: [
        { scope: 'once', labelKey: 'permission.scope.once' },
        { scope: 'session', labelKey: 'permission.scope.session' },
      ],
      ...overrides,
    },
  };
}

/** A fact about a question, numbered like any other event. */
function event(type: string, payload: Record<string, unknown>): Envelope {
  return {
    v: 1,
    id: 'evt-1',
    kind: 'event',
    type,
    ts: '2026-09-19T12:00:01.000Z',
    sessionId: SESSION,
    seq: 1,
    payload,
  };
}

const store = () => usePermissionQueueStore.getState();

describe('the permission queue', () => {
  beforeEach(() => {
    store().reset();
  });

  it('puts a question on screen with everything a person needs to decide', () => {
    store().apply(requested());

    expect(store().pending).toEqual([
      {
        requestId: 'req-1',
        frameId: 'frame-1',
        toolUseId: 'toolu-1',
        toolName: 'Bash',
        description: 'rm -rf build/',
        input: { command: 'rm -rf build/' },
        riskHint: 'destructive',
        defaultToNo: true,
        expiresAt: EXPIRES,
        suggestions: [
          { scope: 'once', labelKey: 'permission.scope.once' },
          { scope: 'session', labelKey: 'permission.scope.session' },
        ],
        isAnswering: false,
      },
    ]);
  });

  it('shows one card for a question republished after a reconnect', () => {
    // The backend republishes what is still open when a client reattaches. The same question
    // twice on screen is the same question twice.
    store().apply(requested());
    store().apply(requested());

    expect(store().pending).toHaveLength(1);
  });

  it('drops a question resolved on another device, on its own — S-72', () => {
    // The queue reacts to the event, never to its own optimism: it was not this client that
    // answered, and the card still has to go.
    store().apply(requested());
    store().apply(
      event('permission.resolved', {
        requestId: 'req-1',
        decision: 'allow',
        auto: false,
        resolvedBy: 'auth|42',
      }),
    );

    expect(store().pending).toEqual([]);
    expect(store().settled).toEqual([
      { requestId: 'req-1', decision: 'allow', auto: false, resolvedBy: 'auth|42' },
    ]);
  });

  it('records a decision nobody made as an automatic one', () => {
    store().apply(requested());
    store().apply(
      event('permission.resolved', { requestId: 'req-1', decision: 'deny', auto: true }),
    );

    expect(store().settled[0]).toEqual({
      requestId: 'req-1',
      decision: 'deny',
      auto: true,
      resolvedBy: null,
    });
  });

  it('moves the deadline when the server extends it', () => {
    store().apply(requested());
    store().apply(
      event('permission.extended', {
        requestId: 'req-1',
        expiresAt: '2026-09-19T12:05:00.000Z',
        remainingExtensions: 1,
      }),
    );

    expect(store().pending[0]?.expiresAt).toBe('2026-09-19T12:05:00.000Z');
  });

  it('refuses a second click while an answer is in flight — S-70', () => {
    store().apply(requested());

    store().markAnswering('req-1');

    expect(store().pending[0]?.isAnswering).toBe(true);
  });

  it('gives the card back when the answer never left', () => {
    // The socket was down, so nothing was answered. Leaving it disabled would leave a question
    // nobody can answer from a screen that looks like it is working on it.
    store().apply(requested());
    store().markAnswering('req-1');

    store().releaseAnswering('req-1');

    expect(store().pending[0]?.isAnswering).toBe(false);
  });

  it('lets an expired card leave as refused, with nobody asked — S-71', () => {
    // The deadline has already refused it on the server; a dialogue about something that is over
    // is a dialogue about nothing.
    store().apply(requested());

    store().expire('req-1');

    expect(store().pending).toEqual([]);
    expect(store().settled[0]).toMatchObject({ decision: 'deny', auto: true });
  });

  it('expiring something that already left changes nothing', () => {
    store().expire('req-1');

    expect(store().settled).toEqual([]);
  });

  it.each([
    ['no request id', { requestId: '' }],
    ['no tool name', { toolName: '' }],
    ['no deadline', { expiresAt: '' }],
    ['a risk this build does not know', { riskHint: 'apocalyptic' }],
    ['no title', { title: '' }],
  ])('drops a question with %s rather than showing a blank', (_case, overrides) => {
    // A card that cannot say what it is asking about is a card nobody can answer honestly.
    store().apply(requested(overrides));

    expect(store().pending).toEqual([]);
  });

  it('offers only the scopes this build can honour', () => {
    // The server would refuse the others, and a button that always fails is worse than no button.
    store().apply(
      requested({
        suggestions: [
          { scope: 'always', labelKey: 'permission.scope.always' },
          { scope: 'once', labelKey: 'permission.scope.once' },
          'junk',
        ],
      }),
    );

    expect(store().pending[0]?.suggestions).toEqual([
      { scope: 'once', labelKey: 'permission.scope.once' },
    ]);
  });

  it('reads an absent `defaultToNo` as refusal', () => {
    store().apply(requested({ defaultToNo: undefined }));

    expect(store().pending[0]?.defaultToNo).toBe(true);
  });

  it('ignores a frame that is none of its business', () => {
    store().apply(event('message.delta', { messageId: 'm1', delta: 'x' }));

    expect(store().pending).toEqual([]);
    expect(store().settled).toEqual([]);
  });
});
