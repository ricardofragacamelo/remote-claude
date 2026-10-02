import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { forgetLiveSessions, liveSessionStoreOf } from '@/features/session';
import { useExportConversation } from '@/features/session/hooks/useExportConversation';
import { useRejections } from '@/features/session/hooks/useRejections';
import { useSessionSettings } from '@/features/session/hooks/useSessionSettings';
import { api } from '@/shared/api/api';
import { aLiveSocket } from '../../../../support/live-socket';
import type { LiveSocket } from '../../../../support/live-socket';
import { providers } from '../../../../support/render';
import { SESSION } from '../../../../support/session-tools';

const FOLDER = '/srv/projects/app';

let live: LiveSocket;

beforeEach(() => {
  forgetLiveSessions();
  live = aLiveSocket();
  vi.spyOn(api, 'get').mockResolvedValue({ current: 'opus', models: [] });
});

afterEach(() => {
  live.close();
  vi.restoreAllMocks();
});

describe('the small hooks of the panel — plan 08, F3 and F4', () => {
  it('exports nothing before the conversation is known', () => {
    const hook = renderHook(() => useExportConversation(null, FOLDER), { wrapper: providers() });

    act(() => {
      hook.result.current.run({ outputs: false });
    });

    expect(hook.result.current.state).toEqual({ kind: 'idle' });
    expect(api.get).not.toHaveBeenCalled();
  });

  it('notes neither the model nor the mode a socket that is down never sent', async () => {
    const hook = renderHook(() => useSessionSettings(FOLDER, SESSION), { wrapper: providers() });
    await waitFor(() => {
      expect(hook.result.current.model).toBe('opus');
    });

    act(() => {
      hook.result.current.setModel('haiku');
      hook.result.current.setMode('plan');
    });

    expect(liveSessionStoreOf(SESSION).getState()).toMatchObject({
      model: null,
      permissionMode: null,
    });
  });

  it('sends one rejection or restoration at a time', () => {
    live.connect();
    const hook = renderHook(() => useRejections(SESSION), { wrapper: providers() });

    act(() => {
      hook.result.current.restore('/srv/projects/app/a.ts');
      hook.result.current.restore('/srv/projects/app/b.ts');
      hook.result.current.rejectHunk('/srv/projects/app/a.ts', 'h1', 'r1');
    });

    const sent = live
      .sent()
      .filter((frame) =>
        ['session.restoreChange', 'session.rejectChange'].includes(String(frame['type'])),
      );
    expect(sent).toHaveLength(1);
  });
});
