import { beforeEach, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { useLiveSessionStore } from '@/features/session';

const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const AT = '2026-09-19T12:00:00.000Z';

/** A frame as the hub sends it: numbered, and belonging to a session. */
function event(type: string, seq: number, payload: Record<string, unknown>): Envelope {
  return {
    v: 1,
    id: `evt-${String(seq)}`,
    kind: 'event',
    type,
    ts: AT,
    sessionId: SESSION,
    seq,
    payload,
  };
}

const store = () => useLiveSessionStore.getState();

/**
 * The three rules of the stream, and the reason each one exists.
 *
 * None of them is a nicety: without the first a reconnect duplicates the tail of the conversation,
 * without the second a hole is stitched into something that looks whole, and without the third two
 * answers in flight become one paragraph of nonsense.
 */
describe('the live session store', () => {
  beforeEach(() => {
    store().reset();
    store().open(SESSION);
  });

  it('starts empty, pointed at the session', () => {
    expect(store().sessionId).toBe(SESSION);
    expect(store().messages).toEqual([]);
    expect(store().lastSeq).toBe(0);
  });

  it('discards an event it has already applied — S-66', () => {
    // A replay re-delivers what the client already has. Without this, every reconnect appends the
    // tail of the conversation a second time.
    store().apply(event('message.delta', 5, { messageId: 'm1', delta: 'one' }));
    store().apply(event('message.delta', 5, { messageId: 'm1', delta: 'again' }));
    store().apply(event('message.delta', 3, { messageId: 'm1', delta: 'older' }));

    expect(store().messages[0]?.text).toBe('one');
    expect(store().lastSeq).toBe(5);
  });

  it('ignores a frame with no sequence at all', () => {
    // A `request` frame carries none: a question is not part of the history of the conversation,
    // and it belongs to the permission queue rather than here.
    const request: Envelope = {
      v: 1,
      id: 'req-1',
      kind: 'request',
      type: 'permission.requested',
      ts: '2026-09-19T12:00:00.000Z',
      sessionId: SESSION,
      payload: { requestId: 'r1' },
    };

    store().apply(request);

    expect(store().lastSeq).toBe(0);
  });

  it('clears everything on reset, which is what a gap calls for — S-67', () => {
    store().apply(event('message.delta', 1, { messageId: 'm1', delta: 'hello' }));

    store().reset();

    expect(store().messages).toEqual([]);
    expect(store().lastSeq).toBe(0);
    expect(store().sessionId).toBeNull();
  });

  describe('messages', () => {
    it('accumulates deltas by messageId — S-68', () => {
      store().apply(event('message.delta', 1, { messageId: 'm1', delta: 'Hel' }));
      store().apply(event('message.delta', 2, { messageId: 'm1', delta: 'lo' }));

      expect(store().messages).toEqual([
        { messageId: 'm1', role: 'assistant', text: 'Hello', isComplete: false },
      ]);
    });

    it('never mixes two messages in flight — S-69', () => {
      // Concatenating in arrival order is the bug this key exists to prevent, and two answers in
      // flight is ordinary rather than exotic.
      store().apply(event('message.delta', 1, { messageId: 'm1', delta: 'left ' }));
      store().apply(event('message.delta', 2, { messageId: 'm2', delta: 'right ' }));
      store().apply(event('message.delta', 3, { messageId: 'm1', delta: 'one' }));
      store().apply(event('message.delta', 4, { messageId: 'm2', delta: 'two' }));

      expect(store().messages.map((message) => message.text)).toEqual(['left one', 'right two']);
    });

    it('replaces the accumulation when the message completes — S-68', () => {
      // Replaces rather than appends: a client that missed a fragment is made whole here.
      store().apply(event('message.delta', 1, { messageId: 'm1', delta: 'par' }));
      store().apply(
        event('message.completed', 2, {
          messageId: 'm1',
          role: 'assistant',
          content: [{ type: 'text', text: 'partial no more' }],
        }),
      );

      expect(store().messages).toEqual([
        { messageId: 'm1', role: 'assistant', text: 'partial no more', isComplete: true },
      ]);
    });

    it('completes the message it names, and leaves the other alone', () => {
      store().apply(event('message.delta', 1, { messageId: 'm1', delta: 'first' }));
      store().apply(event('message.delta', 2, { messageId: 'm2', delta: 'second' }));
      store().apply(
        event('message.completed', 3, {
          messageId: 'm2',
          role: 'assistant',
          content: [{ type: 'text', text: 'second, finished' }],
        }),
      );

      expect(store().messages.map((message) => message.text)).toEqual([
        'first',
        'second, finished',
      ]);
    });

    it('adds a message that completes without ever having streamed', () => {
      store().apply(
        event('message.completed', 1, {
          messageId: 'm9',
          role: 'user',
          content: [{ type: 'text', text: 'sent from a phone' }],
        }),
      );

      expect(store().messages[0]).toMatchObject({ role: 'user', text: 'sent from a phone' });
    });

    it('does not re-open a completed message with a late fragment', () => {
      store().apply(
        event('message.completed', 1, {
          messageId: 'm1',
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
        }),
      );
      store().apply(event('message.delta', 2, { messageId: 'm1', delta: ' and more' }));

      expect(store().messages[0]?.text).toBe('done');
    });

    it('joins the text blocks and ignores the ones that carry none', () => {
      store().apply(
        event('message.completed', 1, {
          messageId: 'm1',
          role: 'assistant',
          content: [{ type: 'text', text: 'a' }, { type: 'tool_use', toolUseId: 't1' }, 'junk'],
        }),
      );

      expect(store().messages[0]?.text).toBe('a');
    });

    it.each([
      ['a delta with no message', 'message.delta', { delta: 'x' }],
      ['a delta with no text', 'message.delta', { messageId: 'm1' }],
      ['a completed message with no id', 'message.completed', { role: 'assistant', content: [] }],
    ])('ignores %s', (_case, type, payload) => {
      store().apply(event(type, 1, payload));

      expect(store().messages).toEqual([]);
    });

    it('accepts a completed message with no blocks as an empty one', () => {
      // Not the same as ignoring it: the server said the message is over, and a message that is
      // over and empty is a fact about the conversation rather than a frame to drop.
      store().apply(event('message.completed', 1, { messageId: 'm1', role: 'assistant' }));

      expect(store().messages).toEqual([
        { messageId: 'm1', role: 'assistant', text: '', isComplete: true },
      ]);
    });
  });

  describe('tools', () => {
    const started = { toolUseId: 't1', toolName: 'Bash', input: { command: 'ls' } };

    it('shows a tool as soon as it starts, with the exact input', () => {
      store().apply(event('tool.started', 1, started));

      expect(store().tools).toEqual([
        {
          toolUseId: 't1',
          toolName: 'Bash',
          input: { command: 'ls' },
          status: 'running',
          output: '',
          summary: null,
        },
      ]);
    });

    it('accumulates its output, and records how it ended', () => {
      store().apply(event('tool.started', 1, started));
      store().apply(event('tool.progress', 2, { toolUseId: 't1', chunk: 'one\n' }));
      store().apply(event('tool.progress', 3, { toolUseId: 't1', chunk: 'two\n' }));
      store().apply(
        event('tool.completed', 4, { toolUseId: 't1', status: 'succeeded', summary: 'ok' }),
      );

      expect(store().tools[0]).toMatchObject({
        output: 'one\ntwo\n',
        status: 'succeeded',
        summary: 'ok',
      });
    });

    it('keeps an input that is not an object out of the way', () => {
      store().apply(event('tool.started', 1, { toolUseId: 't1', toolName: 'Bash', input: 'ls' }));

      expect(store().tools[0]?.input).toEqual({});
    });

    it('changes only the tool a frame names, and leaves its neighbours alone', () => {
      store().apply(event('tool.started', 1, started));
      store().apply(
        event('tool.started', 2, { toolUseId: 't2', toolName: 'Read', input: { file_path: '/a' } }),
      );
      store().apply(event('tool.progress', 3, { toolUseId: 't2', chunk: 'contents' }));

      expect(store().tools.map((tool) => tool.output)).toEqual(['', 'contents']);
    });

    it.each([
      ['progress with no text', 'tool.progress', { toolUseId: 't1' }],
      ['an outcome with no status', 'tool.completed', { toolUseId: 't1' }],
    ])('leaves a tool it knows untouched for %s', (_case, type, payload) => {
      store().apply(event('tool.started', 1, started));

      store().apply(event(type, 2, payload));

      expect(store().tools[0]).toMatchObject({ status: 'running', output: '' });
    });

    it('replaces rather than duplicates when a start is redelivered', () => {
      store().apply(event('tool.started', 1, started));
      store().apply(event('tool.started', 2, started));

      expect(store().tools).toHaveLength(1);
    });

    it.each([
      ['a start with no name', 'tool.started', { toolUseId: 't1' }],
      ['progress for nothing', 'tool.progress', { chunk: 'x' }],
      ['an outcome this build does not know', 'tool.completed', { toolUseId: 't1', status: 'odd' }],
    ])('ignores %s', (_case, type, payload) => {
      store().apply(event(type, 1, payload));

      expect(store().tools.some((tool) => tool.status !== 'running')).toBe(false);
    });
  });

  it('records the status the server reports, and nothing it does not know', () => {
    store().apply(event('session.statusChanged', 1, { status: 'thinking' }));
    expect(store().status).toBe('thinking');

    store().apply(event('session.statusChanged', 2, { status: 'levitating' }));
    expect(store().status).toBe('thinking');
  });

  it.each([
    ['no id', { usage: {}, costUsd: '0.01', durationMs: 1 }],
    ['no cost', { turnId: 'turn-1', usage: {}, durationMs: 1 }],
    ['a duration that is not a number', { turnId: 'turn-1', costUsd: '0.01', durationMs: 'fast' }],
  ])('ignores a finished turn with %s', (_case, payload) => {
    store().apply(event('turn.completed', 1, payload));

    expect(store().lastTurn).toBeNull();
  });

  it('records what the last turn cost', () => {
    store().apply(
      event('turn.completed', 1, {
        turnId: 'turn-1',
        usage: {},
        costUsd: '0.0123',
        durationMs: 2_400,
      }),
    );

    expect(store().lastTurn).toEqual({ turnId: 'turn-1', costUsd: '0.0123', durationMs: 2_400 });
  });

  it('records how the session ended, with the instant of the frame', () => {
    store().apply(event('session.closed', 1, { sessionId: SESSION, reason: 'closedByUser' }));

    expect(store().status).toBe('closed');
    expect(store().ending).toEqual({ reason: 'closedByUser', at: AT });
  });

  it('ignores a close for a reason this build does not know', () => {
    store().apply(event('session.closed', 1, { sessionId: SESSION, reason: 'abducted' }));

    expect(store().ending).toBeNull();
  });

  it('survives a frame with no payload at all', () => {
    const bare: Envelope = {
      v: 1,
      id: 'evt-9',
      kind: 'event',
      type: 'session.statusChanged',
      ts: AT,
      sessionId: SESSION,
      seq: 1,
    };

    store().apply(bare);

    expect(store().status).toBe('starting');
    expect(store().lastSeq).toBe(1);
  });

  it('survives an event it has never heard of', () => {
    // The same survival rule the backend applies to an unknown `SDKMessage`: a published client
    // has to keep working when the contract gains an event it has never seen.
    store().apply(event('session.somethingNew', 1, { whatever: true }));

    expect(store().lastSeq).toBe(1);
    expect(store().messages).toEqual([]);
  });

  it('opens a session as partial when the screen arrived after the fact — S-96', () => {
    store().open(SESSION, { partial: true });

    expect(store().isPartial).toBe(true);
  });
});
