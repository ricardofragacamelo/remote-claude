import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useSetPermissionMode } from '@/features/session/hooks/useSetPermissionMode';
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

describe('changing the permission mode after a plan — plan 08 B-22', () => {
  it('asks the session to go on in the mode chosen — S-93', () => {
    const { result } = renderHook(() => useSetPermissionMode('s-1'));

    result.current('acceptEdits');

    expect(live.lastSent('session.setPermissionMode')?.['payload']).toEqual({
      sessionId: 's-1',
      mode: 'acceptEdits',
    });
  });

  it('sends nothing with no session', () => {
    const { result } = renderHook(() => useSetPermissionMode(null));

    result.current('default');

    expect(live.lastSent('session.setPermissionMode')).toBeUndefined();
  });
});
