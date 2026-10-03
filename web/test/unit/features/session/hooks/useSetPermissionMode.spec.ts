import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useSetPermissionMode } from '@/features/session/hooks/useSetPermissionMode';
import { forgetLiveSessions } from '@/features/session';
import { liveSessionStoreOf } from '@/features/session/store/live-session.store';
import { aLiveSocket } from '../../../../support/live-socket';
import type { LiveSocket } from '../../../../support/live-socket';

let live: LiveSocket;

beforeEach(() => {
  live = aLiveSocket();
  live.connect();
});

afterEach(() => {
  live.close();
  forgetLiveSessions();
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

  it('shows the mode it sent as the mode of the session, as the picker of the header does — S-263', () => {
    const { result } = renderHook(() => useSetPermissionMode('s-1'));

    result.current('default');

    expect(liveSessionStoreOf('s-1').getState().permissionMode).toBe('default');
  });

  it('leaves the mode shown as it was when nothing could be sent', () => {
    live.close();
    const { result } = renderHook(() => useSetPermissionMode('s-1'));

    result.current('acceptEdits');

    expect(live.lastSent('session.setPermissionMode')).toBeUndefined();
    expect(liveSessionStoreOf('s-1').getState().permissionMode).toBeNull();
  });

  it('sends nothing with no session', () => {
    const { result } = renderHook(() => useSetPermissionMode(null));

    result.current('default');

    expect(live.lastSent('session.setPermissionMode')).toBeUndefined();
  });
});
