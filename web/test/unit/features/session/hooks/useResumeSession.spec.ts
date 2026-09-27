import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { RESUME_TIMEOUT_MS, useResumeSession } from '@/features/session/hooks/useResumeSession';
import { aLiveSocket, hubEvent } from '../../../../support/live-socket';
import type { LiveSocket } from '../../../../support/live-socket';

const CONVERSATION = '6b41b192-a41b-46c2-b8d7-5098d8c825be';
const LIVE = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const target = { conversationId: CONVERSATION, workspacePath: '/srv/projects/app' };

/** The guards of a resume that no screen can reach, because its button is disabled first. */
describe('useResumeSession', () => {
  let socket: LiveSocket;

  beforeEach(() => {
    socket = aLiveSocket();
  });

  afterEach(() => {
    socket.close();
  });

  const starts = (): number =>
    socket.sent().filter((frame) => frame['type'] === 'session.start').length;

  it('sends one command for two resumes inside one frame', () => {
    const { result } = renderHook(() => useResumeSession(target, vi.fn()));
    socket.connect();

    act(() => {
      result.current.resume();
      result.current.resume();
    });

    expect(starts()).toBe(1);
  });

  it('sends nothing before it knows which conversation, and where', () => {
    const { result } = renderHook(() => useResumeSession(null, vi.fn()));
    socket.connect();

    act(() => {
      result.current.resume();
    });

    expect(starts()).toBe(0);
  });

  it('takes nothing for an answer while no resume is in flight', () => {
    const onResumed = vi.fn();
    renderHook(() => useResumeSession(target, onResumed));
    socket.connect();

    socket.receive(
      hubEvent(LIVE, 'session.started', 1, { sessionId: LIVE, claudeSessionId: CONVERSATION }),
    );

    expect(onResumed).not.toHaveBeenCalled();
  });

  it('starts no wait for a command the socket did not send', () => {
    const { result } = renderHook(() => useResumeSession(target, vi.fn()));

    act(() => {
      result.current.resume();
    });

    expect(result.current.isResuming).toBe(false);
  });

  describe('a resume nobody answers — plan 05, B-26', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('stops waiting at the deadline, says so, and lets the person try again — S-56', () => {
      const { result } = renderHook(() => useResumeSession(target, vi.fn()));
      socket.connect();
      act(() => {
        result.current.resume();
      });

      act(() => {
        vi.advanceTimersByTime(RESUME_TIMEOUT_MS);
      });

      expect(result.current.isResuming).toBe(false);
      expect(result.current.error).toMatchObject({
        code: 'RESUME_TIMEOUT',
        messageKey: 'session.error.resumeTimeout',
      });

      act(() => {
        result.current.resume();
      });
      expect(starts()).toBe(2);
    });

    it('keeps waiting until the deadline itself — S-56', () => {
      const { result } = renderHook(() => useResumeSession(target, vi.fn()));
      socket.connect();
      act(() => {
        result.current.resume();
      });

      act(() => {
        vi.advanceTimersByTime(RESUME_TIMEOUT_MS - 1);
      });

      expect(result.current.isResuming).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('never fires for a resume that was answered — S-57', () => {
      const onResumed = vi.fn();
      const { result } = renderHook(() => useResumeSession(target, onResumed));
      socket.connect();
      act(() => {
        result.current.resume();
      });

      act(() => {
        socket.receive(
          hubEvent(LIVE, 'session.started', 1, { sessionId: LIVE, claudeSessionId: CONVERSATION }),
        );
      });
      act(() => {
        vi.advanceTimersByTime(RESUME_TIMEOUT_MS);
      });

      expect(onResumed).toHaveBeenCalledWith(LIVE);
      expect(result.current.error).toBeNull();
    });
  });
});
