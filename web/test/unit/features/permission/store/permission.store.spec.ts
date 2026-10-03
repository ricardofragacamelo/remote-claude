import { beforeEach, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { forgetPermissionQueues, permissionQueueOf } from '@/features/permission';
import { claimArrival } from '@/features/permission/store/permission.store';

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

const store = () => permissionQueueOf(SESSION).getState();

describe('the permission queue', () => {
  beforeEach(() => {
    forgetPermissionQueues();
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
          { scope: 'once', labelKey: 'permission.scope.once', rule: null },
          { scope: 'session', labelKey: 'permission.scope.session', rule: null },
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
      {
        requestId: 'req-1',
        decision: 'allow',
        auto: false,
        resolvedBy: 'auth|42',
        resolvedFrom: null,
        toolUseId: 'toolu-1',
        answeredHere: false,
      },
    ]);
  });

  it('keeps the tool the request was about, for the line its card becomes — plan 09, B-23', () => {
    store().apply(requested());
    store().expire('req-1');

    expect(store().settled[0]?.toolUseId).toBe('toolu-1');
  });

  it('knows nothing of the tool of a request it never saw asked — a rule settled it', () => {
    store().apply(
      event('permission.resolved', { requestId: 'req-9', decision: 'allow', auto: true }),
    );

    expect(store().settled[0]).toMatchObject({ toolUseId: null, answeredHere: false });
  });

  it('says the answer was this screen’s when it was answering and nobody else won — plan 09, B-23', () => {
    store().apply(requested());
    store().markAnswering('req-1');
    store().apply(
      event('permission.resolved', {
        requestId: 'req-1',
        decision: 'deny',
        auto: false,
        resolvedBy: 'auth|1',
        resolvedFrom: 'web',
      }),
    );

    expect(store().settled[0]?.answeredHere).toBe(true);
  });

  it('says a phone won the race, even with an answer of ours in flight — plan 09, S-62', () => {
    store().apply(requested());
    store().markAnswering('req-1');
    store().apply(
      event('permission.resolved', {
        requestId: 'req-1',
        decision: 'allow',
        auto: false,
        resolvedBy: 'auth|1',
        resolvedFrom: 'mobile',
      }),
    );

    expect(store().settled[0]).toMatchObject({ answeredHere: false, resolvedFrom: 'mobile' });
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
      resolvedFrom: null,
      toolUseId: 'toolu-1',
      answeredHere: false,
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

  it('moves only the deadline of the question the extension names', () => {
    // Two cards on screen: the one extended gets its new deadline, and the other keeps the one it
    // had — an extension that moved every countdown would hand time to a question nobody asked about.
    store().apply(requested());
    store().apply(requested({ requestId: 'req-2' }));
    const untouched = store().pending[1];

    store().apply(
      event('permission.extended', {
        requestId: 'req-1',
        expiresAt: '2026-09-19T12:05:00.000Z',
        remainingExtensions: 1,
      }),
    );

    expect(store().pending[0]?.expiresAt).toBe('2026-09-19T12:05:00.000Z');
    expect(store().pending[1]).toBe(untouched);
    expect(store().pending[1]?.expiresAt).toBe(EXPIRES);
  });

  it('refuses a second click while an answer is in flight — S-70', () => {
    store().apply(requested());

    store().markAnswering('req-1');

    expect(store().pending[0]?.isAnswering).toBe(true);
  });

  it('disables only the card being answered, leaving the others to be answered', () => {
    store().apply(requested());
    store().apply(requested({ requestId: 'req-2' }));
    const untouched = store().pending[1];

    store().markAnswering('req-1');

    expect(store().pending[0]?.isAnswering).toBe(true);
    expect(store().pending[1]).toBe(untouched);
    expect(store().pending[1]?.isAnswering).toBe(false);
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

  it('knows no tool for an expired request that named none', () => {
    store().apply(requested({ toolUseId: '' }));

    store().expire('req-1');

    expect(store().settled[0]?.toolUseId).toBeNull();
  });

  it('lets a card take the focus once, on arrival — and again after a sign-out — plan 09, D-13', () => {
    expect(claimArrival('req-1')).toBe(true);
    expect(claimArrival('req-1')).toBe(false);
    expect(claimArrival('req-2')).toBe(true);

    forgetPermissionQueues();

    expect(claimArrival('req-1')).toBe(true);
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
    // An `always` with no rule to describe cannot be honoured honestly (S-67), and a scope nobody
    // has heard of would be refused: a button that always fails is worse than no button.
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
      { scope: 'once', labelKey: 'permission.scope.once', rule: null },
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
