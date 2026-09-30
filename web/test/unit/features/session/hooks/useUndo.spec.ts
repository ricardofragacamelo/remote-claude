import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { liveSessionStoreOf } from '@/features/session';
import { useUndo } from '@/features/session/hooks/useUndo';
import type { SessionStatus } from '@/features/session';
import type { Envelope } from '@remote-claude/contracts';
import { aLiveSocket, hubEvent } from '../../../../support/live-socket';
import type { LiveSocket } from '../../../../support/live-socket';
import { providers } from '../../../../support/render';
import {
  aCheckpointDto,
  anIncompleteRewind,
  aRefusal,
  aRewoundPayload,
  routeApi,
  SESSION,
} from '../../../../support/session-tools';

const PATH = `/sessions/${SESSION}/checkpoints`;

const apply = (type: string, seq: number, payload: Record<string, unknown>): void => {
  act(() => {
    liveSessionStoreOf(SESSION)
      .getState()
      .apply(hubEvent(SESSION, type, seq, payload) as unknown as Envelope);
  });
};

const rewinds = (socket: LiveSocket) =>
  socket.sent().filter((frame) => frame['type'] === 'session.rewindFiles');

describe('useUndo — plan 04, B-19', () => {
  let socket: LiveSocket;

  beforeEach(() => {
    socket = aLiveSocket();
    socket.connect();
  });

  afterEach(() => {
    socket.close();
    vi.restoreAllMocks();
  });

  const idle = (): void => {
    apply('session.statusChanged', 1, { status: 'idle' });
  };

  it('loads the points of the session', async () => {
    routeApi({ [PATH]: [{ checkpoints: [aCheckpointDto()] }] });
    idle();
    const { result } = renderHook(() => useUndo(SESSION), { wrapper: providers() });

    await waitFor(() => {
      expect(result.current.checkpoints).toHaveLength(1);
    });
    expect(result.current.availability).toBe('ready');
    expect(result.current.error).toBeNull();
  });

  it.each<SessionStatus>(['starting', 'thinking', 'running', 'waitingPermission'])(
    'is busy while the session is %s — S-43',
    (status) => {
      routeApi({ [PATH]: [{ checkpoints: [] }] });
      act(() => {
        liveSessionStoreOf(SESSION).setState({ status });
      });
      const { result } = renderHook(() => useUndo(SESSION), { wrapper: providers() });

      expect(result.current.availability).toBe('busy');
    },
  );

  it('asks nothing of a session that has ended — S-39', () => {
    const get = routeApi({ [PATH]: [{ checkpoints: [] }] });
    apply('session.closed', 1, { sessionId: SESSION, reason: 'completed' });
    const { result } = renderHook(() => useUndo(SESSION), { wrapper: providers() });

    expect(result.current.availability).toBe('ended');
    expect(result.current.isLoading).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it('sends one undo for two clicks inside one frame', () => {
    routeApi({ [PATH]: [{ checkpoints: [] }] });
    idle();
    const { result } = renderHook(() => useUndo(SESSION), { wrapper: providers() });

    act(() => {
      result.current.rewind('prompt-2');
      result.current.rewind('prompt-2');
    });

    expect(rewinds(socket)).toHaveLength(1);
    expect(rewinds(socket)[0]).toMatchObject({
      payload: { sessionId: SESSION, promptId: 'prompt-2' },
    });
    expect(result.current.isRewinding).toBe(true);
  });

  it('takes the refusal of its undo, and stops waiting — S-43', () => {
    routeApi({ [PATH]: [{ checkpoints: [] }] });
    idle();
    const { result } = renderHook(() => useUndo(SESSION), { wrapper: providers() });

    act(() => {
      result.current.rewind('prompt-2');
    });
    const commandId = String(rewinds(socket)[0]?.['id']);
    socket.receive(aRefusal(commandId, 'SESSION_LOCKED', 'session.error.locked'));

    expect(result.current.refusal).toMatchObject({ code: 'SESSION_LOCKED' });
    expect(result.current.isRewinding).toBe(false);
  });

  it('settles on the outcome, and asks for the points again — S-37', async () => {
    const get = routeApi({ [PATH]: [{ checkpoints: [aCheckpointDto()] }] });
    idle();
    const { result } = renderHook(() => useUndo(SESSION), { wrapper: providers() });
    await waitFor(() => {
      expect(result.current.checkpoints).toHaveLength(1);
    });

    act(() => {
      result.current.rewind('prompt-2');
    });
    apply('session.rewound', 2, aRewoundPayload());

    expect(result.current.isRewinding).toBe(false);
    expect(result.current.outcome).toMatchObject({ promptId: 'prompt-2' });
    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(2);
    });
  });

  it('asks for the points again when a turn completes, and on reload', async () => {
    const get = routeApi({ [PATH]: [{ checkpoints: [] }] });
    idle();
    const { result } = renderHook(() => useUndo(SESSION), { wrapper: providers() });
    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(1);
    });

    apply('turn.completed', 2, { turnId: 't1', usage: {}, costUsd: '0.01', durationMs: 5 });
    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(2);
    });

    // A status change is not a reason: nothing on disk moved.
    apply('session.statusChanged', 3, { status: 'idle' });
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(3);
    });
  });

  it('says so when the undo stopped short, and forgets it on the next one — S-44', () => {
    routeApi({ [PATH]: [{ checkpoints: [] }] });
    idle();
    const { result } = renderHook(() => useUndo(SESSION), { wrapper: providers() });

    socket.receive(anIncompleteRewind('another-session', 1));
    expect(result.current.incomplete).toBeNull();

    socket.receive(anIncompleteRewind(SESSION, 1));
    expect(result.current.incomplete).toMatchObject({ params: { failed: 1 } });

    act(() => {
      result.current.rewind('prompt-2');
    });
    expect(result.current.incomplete).toBeNull();
  });
});
