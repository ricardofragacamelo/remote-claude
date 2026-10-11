import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Envelope } from '@remote-claude/contracts';

import { commandRegistry } from '@/features/commands';
import { permissionQueueOf } from '@/features/permission';
import { forgetLiveSessions } from '@/features/session';
import { usePanelCommands } from '@/features/session/hooks/usePanelCommands';
import { usePanelTabs } from '@/features/session/hooks/usePanelTabs';
import { agentPanelStore, forgetAgentPanel } from '@/features/session/store/agent-panel.store';
import { liveSessionStoreOf } from '@/features/session/store/live-session.store';
import { aLiveSocket } from '../../../../support/live-socket';
import type { LiveSocket } from '../../../../support/live-socket';
import { providers } from '../../../../support/render';
import { aToolCall } from '../../../../support/canonical-tool';
import { api } from '@/shared/api/api';
import { anEngineList, CAPABILITIES } from '../../../../support/engines';
import { hubEvent } from '../../../../support/live-socket';

const FOLDER = '/srv/projects/app';

let live: LiveSocket;

/** What `GET /engines` answers — the default engine's modes, or none at all. */
let listed: Record<string, unknown> | null;

beforeEach(() => {
  live = aLiveSocket();
  listed = anEngineList();
  vi.spyOn(api, 'get').mockImplementation((path: string) =>
    path === '/engines' && listed !== null
      ? Promise.resolve(listed)
      : Promise.reject(new Error(`unexpected GET ${path}`)),
  );
});

afterEach(() => {
  live.close();
  forgetLiveSessions();
  forgetAgentPanel(null);
  vi.restoreAllMocks();
});

/** The commands, once `GET /engines` was read — the modes come from it before a session says them. */
async function commands(): Promise<void> {
  const { result } = renderHook(
    () => {
      usePanelCommands(FOLDER, usePanelTabs(FOLDER));
      return true;
    },
    { wrapper: providers() },
  );
  expect(result.current).toBe(true);
  await waitFor(() => {
    expect(api.get).toHaveBeenCalledWith('/engines');
  });
  await act(async () => {
    await Promise.resolve();
  });
}

/** A session `s-1` whose stream said it started, in `mode`, with what its engine can do. */
function started(mode: string, capabilities?: unknown): void {
  live.connect();
  act(() => {
    agentPanelStore(FOLDER).getState().show('session', 's-1');
  });
  act(() => {
    liveSessionStoreOf('s-1')
      .getState()
      .apply(
        hubEvent('s-1', 'session.started', 1, {
          sessionId: 's-1',
          permissionMode: mode,
          ...(capabilities === undefined ? {} : { capabilities }),
        }) as unknown as Envelope,
      );
  });
}

/** The tab of the panel on screen. */
const activeTab = () => {
  const { tabs, active } = agentPanelStore(FOLDER).getState();
  return tabs.find((tab) => tab.key === active);
};

const cycle = () => {
  const command = commandRegistry.command('agent.cycleMode');
  expect(command).toBeDefined();
  return command as NonNullable<typeof command>;
};

describe('switching the mode from the palette — plan 09, D-09', () => {
  it('is not offered on a conversation of the history, which has no mode, and does nothing there', async () => {
    live.connect();
    await commands();
    act(() => {
      agentPanelStore(FOLDER).getState().show('conversation', { engine: 'claude', id: 'c-1' });
    });

    expect(cycle().when?.()).toBe(false);
    act(() => {
      cycle().run();
    });
    expect(live.lastSent('session.setPermissionMode')).toBeUndefined();
  });

  it('leaves the mode of a session as it was when nothing could be sent', async () => {
    await commands();
    act(() => {
      agentPanelStore(FOLDER).getState().show('session', 's-1');
    });

    expect(cycle().when?.()).toBe(true);
    act(() => {
      cycle().run();
    });

    expect(liveSessionStoreOf('s-1').getState().permissionMode).toBeNull();
  });

  it('moves a session to the next mode its engine announces — plan 28, S-81', async () => {
    await commands();
    started('readOnly', { ...CAPABILITIES, permissionModes: ['acceptEdits', 'readOnly'] });

    act(() => {
      cycle().run();
    });

    expect(live.lastSent('session.setPermissionMode')).toMatchObject({
      payload: { sessionId: 's-1', mode: 'acceptEdits' },
    });
    expect(liveSessionStoreOf('s-1').getState().permissionMode).toBe('acceptEdits');
  });

  it('moves a session by the list of engines before its stream says what it can do', async () => {
    await commands();
    started('ask');

    act(() => {
      cycle().run();
    });

    expect(live.lastSent('session.setPermissionMode')).toMatchObject({
      payload: { mode: 'acceptEdits' },
    });
  });

  it('sends nothing for a session whose engine has one mode — S-81', async () => {
    await commands();
    started('ask', { ...CAPABILITIES, permissionModes: ['ask'] });

    act(() => {
      cycle().run();
    });

    expect(live.lastSent('session.setPermissionMode')).toBeUndefined();
    expect(liveSessionStoreOf('s-1').getState().permissionMode).toBe('ask');
  });

  it('moves a draft from the mode it shows to the next the default engine announces', async () => {
    await commands();
    const panel = agentPanelStore(FOLDER).getState();
    act(() => {
      panel.openDraft();
    });

    act(() => {
      cycle().run();
    });

    expect(activeTab()).toMatchObject({ kind: 'draft', choices: { mode: 'acceptEdits' } });
  });

  it('leaves a draft as it was while the engines are not known', async () => {
    listed = null;
    await commands();
    act(() => {
      agentPanelStore(FOLDER).getState().openDraft();
    });

    act(() => {
      cycle().run();
    });

    expect(activeTab()).toMatchObject({ kind: 'draft', choices: { mode: 'ask' } });
  });
});

describe('going to the question waiting — plan 09, B-25', () => {
  const goTo = () => {
    const command = commandRegistry.command('agent.goToRequest');
    expect(command).toBeDefined();
    return command as NonNullable<typeof command>;
  };

  /** A question of `sessionId`, as the queue holds it. */
  function asked(sessionId: string, requestId: string): void {
    act(() => {
      permissionQueueOf(sessionId)
        .getState()
        .apply({
          v: 1,
          id: `frame-${requestId}`,
          kind: 'request',
          type: 'permission.requested',
          ts: '2026-10-03T12:00:00.000Z',
          payload: {
            requestId,
            toolUseId: 't1',
            ...aToolCall('Bash'),
            title: 'permission.tool.shell',
            riskHint: 'read',
            expiresAt: '2999-01-01T00:00:00.000Z',
          },
        });
    });
  }

  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((run) => {
      run(0);
      return 0;
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('is offered with a session, saying none waits — and then puts the focus in the box — S-71', async () => {
    await commands();
    expect(goTo().when?.()).toBe(false);

    act(() => {
      agentPanelStore(FOLDER).getState().show('session', 's-1');
    });
    const box = document.createElement('textarea');
    box.setAttribute('data-composer', FOLDER);
    document.body.append(box);

    expect(goTo().when?.()).toBe(true);
    expect(goTo().labelKey).toBe('command.agent.goToRequestNone');
    // From the box too, where a question leaves the focus of who writes (D-13).
    expect(commandRegistry.bindingOf('agent.goToRequest')).toMatchObject({
      key: 'Mod+Alt+P',
      allowInInput: true,
    });
    act(() => {
      void goTo().run();
    });

    expect(document.activeElement).toBe(box);
  });

  it('says how many wait, and takes the focus to the oldest, with the conversation on screen — S-71', async () => {
    await commands();
    act(() => {
      agentPanelStore(FOLDER).getState().show('session', 's-1');
      agentPanelStore(FOLDER).getState().showPane('changes');
    });
    asked('s-1', 'req-1');
    asked('s-1', 'req-2');
    const card = document.createElement('li');
    card.setAttribute('data-permission-request', 'req-1');
    card.tabIndex = -1;
    document.body.append(card);

    expect(goTo().labelKey).toBe('command.agent.goToRequest');
    expect(goTo().labelParams).toEqual({ count: 2 });
    act(() => {
      void goTo().run();
    });

    expect(agentPanelStore(FOLDER).getState().pane).toBe('chat');
    expect(document.activeElement).toBe(card);
  });
});
