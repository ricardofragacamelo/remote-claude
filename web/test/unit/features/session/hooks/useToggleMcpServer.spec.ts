import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import {
  useReconnectMcpServer,
  useToggleMcpServer,
} from '@/features/session/hooks/useSessionInsight';
import { aLiveSocket } from '../../../../support/live-socket';
import type { LiveSocket } from '../../../../support/live-socket';

let live: LiveSocket;

beforeEach(() => {
  live = aLiveSocket();
  live.connect();
});

afterEach(() => {
  live.close();
});

describe('switching an MCP server of a session on or off — plan 13, B-22', () => {
  it('sends the toggle, with the name and the state asked for', () => {
    const { result } = renderHook(() => useToggleMcpServer('s-1'));

    result.current('docs', false);

    expect(live.lastSent('session.toggleMcpServer')?.['payload']).toEqual({
      sessionId: 's-1',
      name: 'docs',
      enabled: false,
    });
  });

  it('sends nothing with no session', () => {
    const { result } = renderHook(() => useToggleMcpServer(null));

    result.current('docs', true);

    expect(live.lastSent('session.toggleMcpServer')).toBeUndefined();
  });
});

describe('reconnecting an MCP server of a session — plan 13, B-22', () => {
  it('sends the reconnect, with the name', () => {
    const { result } = renderHook(() => useReconnectMcpServer('s-1'));

    result.current('docs');

    expect(live.lastSent('session.reconnectMcpServer')?.['payload']).toEqual({
      sessionId: 's-1',
      name: 'docs',
    });
  });

  it('sends nothing with no session', () => {
    const { result } = renderHook(() => useReconnectMcpServer(null));

    result.current('docs');

    expect(live.lastSent('session.reconnectMcpServer')).toBeUndefined();
  });
});
