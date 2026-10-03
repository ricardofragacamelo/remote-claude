import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { forgetLiveSessions } from '@/features/session';
import { useQueue } from '@/features/session/hooks/useQueue';
import { aLiveSocket } from '../../../../support/live-socket';
import type { LiveSocket } from '../../../../support/live-socket';
import { aRefusal } from '../../../../support/session-tools';

const SESSION = 's-1';

let live: LiveSocket;

beforeEach(() => {
  live = aLiveSocket();
  live.connect();
});

afterEach(() => {
  live.close();
  forgetLiveSessions();
});

const cancels = (): Record<string, unknown>[] =>
  live.sent().filter((frame) => frame['type'] === 'session.cancelQueuedPrompt');

describe('taking a prompt out of the queue — plan 08, B-34; plan 09, S-31', () => {
  it('asks once for the same prompt, however often it is asked', () => {
    const { result } = renderHook(() => useQueue(SESSION));

    act(() => {
      result.current.cancel('q1');
      result.current.cancel('q1');
      result.current.cancel('q2');
    });

    expect(cancels().map((frame) => (frame['payload'] as { queueId: string }).queueId)).toEqual([
      'q1',
      'q2',
    ]);
  });

  it('may ask again once the first was refused', () => {
    const { result } = renderHook(() => useQueue(SESSION));

    act(() => {
      result.current.cancel('q1');
    });
    live.receive(
      aRefusal(
        String(cancels()[0]?.['id']),
        'QUEUED_PROMPT_STARTED',
        'session.error.queuedPromptStarted',
      ),
    );
    expect(result.current.refusal?.messageKey).toBe('session.error.queuedPromptStarted');

    act(() => {
      result.current.cancel('q1');
    });

    expect(cancels()).toHaveLength(2);
  });

  it('counts nothing as asked while the socket is down', () => {
    live.close();
    const { result } = renderHook(() => useQueue(SESSION));

    act(() => {
      result.current.cancel('q1');
    });

    expect(cancels()).toHaveLength(0);
  });
});
