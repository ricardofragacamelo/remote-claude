import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useCommandRefusal } from '@/features/session/hooks/useCommandRefusal';
import { aLiveSocket } from '../../../../support/live-socket';
import type { LiveSocket } from '../../../../support/live-socket';
import { aRefusal } from '../../../../support/session-tools';

const locked = (id: string) => aRefusal(id, 'SESSION_LOCKED', 'session.error.locked');

/** Telling the refusal of my command from every other refusal on the socket. */
describe('useCommandRefusal', () => {
  let socket: LiveSocket;

  beforeEach(() => {
    socket = aLiveSocket();
    socket.connect();
  });

  afterEach(() => {
    socket.close();
  });

  it('waits for nothing until a command left', () => {
    const { result } = renderHook(() => useCommandRefusal());

    socket.receive(locked('cmd-1'));

    expect(result.current.error).toBeNull();
    expect(result.current.isAwaiting).toBe(false);
    expect(result.current.inFlight()).toBe(false);
  });

  it('takes the refusal that names its command, and stops waiting', () => {
    const { result } = renderHook(() => useCommandRefusal());

    act(() => {
      result.current.expect('cmd-1');
    });
    expect(result.current.isAwaiting).toBe(true);
    expect(result.current.inFlight()).toBe(true);

    socket.receive(locked('cmd-1'));

    expect(result.current.error).toMatchObject({ code: 'SESSION_LOCKED' });
    expect(result.current.isAwaiting).toBe(false);
    expect(result.current.inFlight()).toBe(false);
  });

  it('ignores the refusal of somebody else’s command', () => {
    const { result } = renderHook(() => useCommandRefusal());

    act(() => {
      result.current.expect('cmd-1');
    });
    socket.receive(locked('cmd-2'));

    expect(result.current.error).toBeNull();
    expect(result.current.isAwaiting).toBe(true);
  });

  it('clears the last refusal when the next command leaves', () => {
    const { result } = renderHook(() => useCommandRefusal());

    act(() => {
      result.current.expect('cmd-1');
    });
    socket.receive(locked('cmd-1'));
    act(() => {
      result.current.expect('cmd-2');
    });

    expect(result.current.error).toBeNull();
  });

  it('waits for nothing when the command never left', () => {
    const { result } = renderHook(() => useCommandRefusal());

    act(() => {
      result.current.expect(null);
    });

    expect(result.current.isAwaiting).toBe(false);
  });

  it('stops listening once the outcome arrived some other way', () => {
    const { result } = renderHook(() => useCommandRefusal());

    act(() => {
      result.current.expect('cmd-1');
      result.current.settle();
    });
    socket.receive(locked('cmd-1'));

    expect(result.current.isAwaiting).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
