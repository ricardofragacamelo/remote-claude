import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useConnectionNotices } from '@/features/notifications/hooks/useConnectionNotices';
import { wsClient } from '@/shared/api/ws';
import type { ConnectionStatus } from '@/shared/api/ws-client';
import { onNotify } from '@/shared/lib/notify';
import type { Notification } from '@/shared/lib/notify';

afterEach(() => {
  vi.restoreAllMocks();
});

/** The socket's status, moved by the test. */
function aSocket() {
  let tell: (status: ConnectionStatus) => void = () => undefined;
  vi.spyOn(wsClient, 'onStatus').mockImplementation((listener) => {
    tell = listener;
    return () => undefined;
  });
  return {
    to: (status: ConnectionStatus) => {
      act(() => {
        tell(status);
      });
    },
  };
}

function mounted() {
  const socket = aSocket();
  const told: Notification[] = [];
  const stop = onNotify((notification) => told.push(notification));
  const onRestored = vi.fn();
  renderHook(() => {
    useConnectionNotices(onRestored);
  });
  return { socket, told, stop, onRestored };
}

describe('the connection, told — plan 06, S-193', () => {
  it('says once that it dropped, and once that it is back', () => {
    const { socket, told, stop, onRestored } = mounted();

    socket.to('connecting');
    socket.to('ready');
    socket.to('reconnecting');
    socket.to('throttled');
    socket.to('reconnecting');
    socket.to('ready');

    expect(told.map((each) => [each.severity, each.messageKey])).toEqual([
      ['warning', 'notification.connection.lost'],
      ['info', 'notification.connection.restored'],
    ]);
    expect(onRestored).toHaveBeenCalledTimes(1);
    stop();
  });

  it('says nothing for opening the app, nor for signing out', () => {
    const { socket, told, stop } = mounted();

    socket.to('connecting');
    socket.to('ready');
    socket.to('closed');

    expect(told).toEqual([]);
    stop();
  });

  it('says it is back after being held back too', () => {
    const { socket, told, stop } = mounted();

    socket.to('ready');
    socket.to('throttled');
    socket.to('ready');

    expect(told.map((each) => each.messageKey)).toEqual([
      'notification.connection.lost',
      'notification.connection.restored',
    ]);
    stop();
  });
});
