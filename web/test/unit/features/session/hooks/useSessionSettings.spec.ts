import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { forgetLiveSessions } from '@/features/session';
import { useSessionSettings } from '@/features/session/hooks/useSessionSettings';
import { claudePanelStore, forgetClaudePanel } from '@/features/session/store/claude-panel.store';
import { liveSessionStoreOf } from '@/features/session/store/live-session.store';
import { aLiveSocket } from '../../../../support/live-socket';
import type { LiveSocket } from '../../../../support/live-socket';
import { providers } from '../../../../support/render';
import { aRefusal, routeApi } from '../../../../support/session-tools';

const FOLDER = '/srv/projects/app';
const SESSION = 's-1';
const MODELS = `/sessions/${SESSION}/models`;

let live: LiveSocket;

beforeEach(() => {
  live = aLiveSocket();
  live.connect();
});

afterEach(() => {
  live.close();
  forgetLiveSessions();
  forgetClaudePanel(null);
  vi.restoreAllMocks();
});

function settings(running = true) {
  return renderHook(() => useSessionSettings(FOLDER, SESSION, running), { wrapper: providers() });
}

describe('the choices of a live session — plan 09, B-11', () => {
  it('shows a change at once, and puts the chip back with the reason when it is refused — S-23', async () => {
    routeApi({ [MODELS]: [{ current: 'opus', models: [] }] });
    liveSessionStoreOf(SESSION).getState().noteMode('plan');
    const { result } = settings();

    act(() => {
      result.current.setMode('acceptEdits');
    });
    expect(result.current.mode).toBe('acceptEdits');

    const sent = String(live.lastSent('session.setPermissionMode')?.['id']);
    live.receive(aRefusal(sent, 'INVALID_INPUT', 'common.error.invalidInput'));

    await waitFor(() => {
      expect(result.current.mode).toBe('plan');
    });
    expect(result.current.refusal?.messageKey).toBe('common.error.invalidInput');
  });

  it('puts the model back too — unknown included — when its change is refused — S-23', async () => {
    routeApi({ [MODELS]: [{ current: 'opus', models: [] }] });
    const { result } = settings();

    act(() => {
      result.current.setModel('haiku');
    });
    expect(result.current.model).toBe('haiku');

    const sent = String(live.lastSent('session.setModel')?.['id']);
    live.receive(aRefusal(sent, 'INVALID_INPUT', 'common.error.invalidInput'));

    await waitFor(() => {
      expect(result.current.model).toBe('opus');
    });
  });

  it('keeps a change nobody refused, and an unrelated refusal changes nothing', async () => {
    routeApi({ [MODELS]: [{ current: 'opus', models: [] }] });
    const { result } = settings();

    act(() => {
      result.current.setMode('plan');
    });
    live.receive(aRefusal('someone-else', 'INVALID_INPUT', 'common.error.invalidInput'));

    await waitFor(() => {
      expect(result.current.mode).toBe('plan');
    });
    expect(result.current.refusal).toBeNull();
  });

  it('changes nothing on screen when nothing could be sent', () => {
    routeApi({ [MODELS]: [{ current: 'opus', models: [] }] });
    live.close();
    const { result } = settings();

    act(() => {
      result.current.setMode('plan');
      result.current.setModel('haiku');
    });

    expect(result.current.mode).toBeNull();
    expect(live.lastSent('session.setModel')).toBeUndefined();
  });

  it('reads the effort the draft opened the session with, and knows none it did not — S-90', () => {
    routeApi({ [MODELS]: [{ current: 'opus', models: [] }] });
    const { result } = settings();
    expect(result.current.effort).toBeUndefined();

    const panel = claudePanelStore(FOLDER).getState();
    const draft = panel.openDraft();
    panel.setChoices(draft, { model: 'opus', mode: 'default', effort: 'high' });
    act(() => {
      panel.promote(draft, SESSION);
    });

    expect(result.current.effort).toBe('high');
  });

  it('asks an ended session for no models', () => {
    const get = routeApi({ [MODELS]: [{ current: 'opus', models: [] }] });
    settings(false);

    expect(get).not.toHaveBeenCalledWith(MODELS);
  });
});
